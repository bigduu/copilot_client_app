import { backendContextService } from "../../services/BackendContextService";
import type { Message } from "../../types/chat";

type LegacyOptimizedChatItem = {
  id: string;
  title: string;
  createdAt: number;
  pinned?: boolean;
  config: any;
  messageCount: number;
  lastMessageAt?: number;
};

type MigrationResult = {
  migratedContexts: number;
  migratedMessages: number;
  promptMappings: Record<string, string>;
};

type LegacyBackup = {
  chats: LegacyOptimizedChatItem[];
  messages: Record<string, Message[]>;
  prompts: Array<{ id: string; content: string }>;
  createdAt: number;
};

const STORAGE_KEYS = {
  CHATS: "copilot_chats_v2",
  MESSAGES_PREFIX: "copilot_messages_v2_",
  SYSTEM_PROMPTS: "copilot_system_prompts_v1",
};

const BACKUP_KEY = "copilot_migration_backup_v1";
const LAST_RESULT_SESSION_KEY = "copilot_migration_last_result";

export class LocalStorageMigrator {
  async needsMigration(): Promise<boolean> {
    const chats = localStorage.getItem(STORAGE_KEYS.CHATS);
    const messagesKeysExist = this.getAllMessageKeys().length > 0;
    return Boolean(chats) || messagesKeysExist;
  }

  async migrateAll(): Promise<MigrationResult> {
    const result: MigrationResult = {
      migratedContexts: 0,
      migratedMessages: 0,
      promptMappings: {},
    };

    const legacyChats = this.loadLegacyChats();
    if (legacyChats.length === 0) return result;

    // Validate data before migration
    console.info("[Migration] Validating legacy data...");
    const validationErrors = this.validateLegacyData();
    if (validationErrors.length > 0) {
      console.error(
        "[Migration] Validation failed with errors:",
        validationErrors
      );
      throw new Error(
        `Data validation failed: ${validationErrors.slice(0, 3).join("; ")}`
      );
    }
    console.info("[Migration] Validation passed");

    // Create backup before mutating anything
    this.createBackup();

    // Map legacy system prompts first (if any)
    const legacyPrompts = this.loadLegacyPrompts();
    console.info(
      `[Migration] Found ${legacyPrompts.length} legacy system prompts`
    );
    for (const prompt of legacyPrompts) {
      console.info(`[Migration] Creating system prompt: ${prompt.id}`);
      // Use existing ID to preserve references when possible
      await backendContextService.createSystemPrompt(prompt.id, prompt.content);
      result.promptMappings[prompt.id] = prompt.id;
    }

    // Create contexts and push messages
    console.info(
      `[Migration] Found ${legacyChats.length} legacy chats to migrate`
    );
    for (const chat of legacyChats) {
      console.info(
        `[Migration] Creating context for chat '${chat.title}' (${chat.id})`
      );
      const system_prompt_id: string | undefined =
        chat.config?.baseSystemPromptId || chat.config?.systemPromptId;

      const { id: contextId } = await backendContextService.createContext({
        model_id:
          chat.config?.modelId || chat.config?.model_id || "gpt-4o-mini",
        mode: chat.config?.mode || "assistant",
        system_prompt_id: system_prompt_id,
      });

      result.migratedContexts += 1;

      const messages = this.loadLegacyMessages(chat.id);
      console.info(
        `[Migration] Migrating ${messages.length} messages for chat '${chat.title}' (${chat.id})`
      );
      for (const message of messages) {
        const { role, content } = this.convertMessage(message);
        await backendContextService.addMessage(contextId, { role, content });
        result.migratedMessages += 1;
      }
    }

    console.info(
      `[Migration] Completed. Contexts: ${result.migratedContexts}, Messages: ${result.migratedMessages}, Prompts: ${Object.keys(result.promptMappings).length}`
    );

    try {
      sessionStorage.setItem(LAST_RESULT_SESSION_KEY, JSON.stringify(result));
    } catch {}
    return result;
  }

  getLastResult(): MigrationResult | null {
    try {
      const s = sessionStorage.getItem(LAST_RESULT_SESSION_KEY);
      return s ? (JSON.parse(s) as MigrationResult) : null;
    } catch {
      return null;
    }
  }

  private createBackup(): void {
    try {
      const chats = this.loadLegacyChats();
      const prompts = this.loadLegacyPrompts();
      const messages: Record<string, Message[]> = {};
      for (const chat of chats) {
        messages[chat.id] = this.loadLegacyMessages(chat.id);
      }
      const backup: LegacyBackup = {
        chats,
        messages,
        prompts,
        createdAt: Date.now(),
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      console.info("[Migration] Legacy data backup created");
    } catch (err) {
      console.warn("[Migration] Failed to create backup:", err);
    }
  }

  hasBackup(): boolean {
    return localStorage.getItem(BACKUP_KEY) !== null;
  }

  rollbackFromBackup(): { restored: boolean; error?: string } {
    try {
      const stored = localStorage.getItem(BACKUP_KEY);
      if (!stored) return { restored: false, error: "No backup found" };
      const backup = JSON.parse(stored) as LegacyBackup;

      // Restore chats index
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(backup.chats));

      // Restore messages
      for (const [chatId, msgs] of Object.entries(backup.messages)) {
        localStorage.setItem(
          `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`,
          JSON.stringify(msgs)
        );
      }

      // Restore prompts
      localStorage.setItem(
        STORAGE_KEYS.SYSTEM_PROMPTS,
        JSON.stringify(backup.prompts)
      );

      console.info("[Migration] Legacy data restored from backup");
      return { restored: true };
    } catch (err: any) {
      return { restored: false, error: String(err) };
    }
  }

  private loadLegacyChats(): LegacyOptimizedChatItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (!stored) return [];
      return JSON.parse(stored) as LegacyOptimizedChatItem[];
    } catch {
      return [];
    }
  }

  private loadLegacyPrompts(): Array<{ id: string; content: string }> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SYSTEM_PROMPTS);
      if (!stored) return [];
      return JSON.parse(stored) as Array<{ id: string; content: string }>;
    } catch {
      return [];
    }
  }

  private getAllMessageKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(STORAGE_KEYS.MESSAGES_PREFIX)) keys.push(key);
    }
    return keys;
  }

  private loadLegacyMessages(chatId: string): Message[] {
    try {
      const stored = localStorage.getItem(
        `${STORAGE_KEYS.MESSAGES_PREFIX}${chatId}`
      );
      return stored ? (JSON.parse(stored) as Message[]) : [];
    } catch {
      return [];
    }
  }

  private convertMessage(message: Message): { role: string; content: string } {
    const role =
      message.role === "assistant" ||
      message.role === "user" ||
      message.role === "system"
        ? message.role
        : "user";

    // Handle tool call messages - preserve metadata
    if ("type" in message) {
      if (message.type === "tool_call") {
        // Convert tool call to JSON representation for backend
        const toolCallData = {
          type: "tool_call",
          toolCalls: message.toolCalls,
        };
        return { role, content: JSON.stringify(toolCallData) };
      } else if (message.type === "tool_result") {
        // Convert tool result to JSON representation
        const toolResultData = {
          type: "tool_result",
          toolName: message.toolName,
          toolCallId: message.toolCallId,
          result: message.result,
          isError: message.isError,
        };
        return { role, content: JSON.stringify(toolResultData) };
      } else if (message.type === "file_reference") {
        // Convert file reference to JSON representation
        const fileRefData = {
          type: "file_reference",
          paths: message.paths, // ✅ Changed to paths array
          display_text: message.displayText,
        };
        return { role, content: JSON.stringify(fileRefData) };
      }
    }

    // Handle regular content
    const content =
      "content" in message && typeof message.content === "string"
        ? message.content
        : ((message as any).content?.text ?? JSON.stringify(message));
    return { role, content };
  }

  /**
   * Validate legacy data before migration
   * Returns list of validation errors, empty if valid
   */
  validateLegacyData(): string[] {
    const errors: string[] = [];

    try {
      // Validate chats
      const chats = this.loadLegacyChats();
      for (const chat of chats) {
        if (!chat.id || typeof chat.id !== "string") {
          errors.push(`Invalid chat ID: ${JSON.stringify(chat)}`);
        }
        if (!chat.title || typeof chat.title !== "string") {
          errors.push(`Chat ${chat.id} has invalid title`);
        }
        if (typeof chat.createdAt !== "number" || chat.createdAt <= 0) {
          errors.push(`Chat ${chat.id} has invalid createdAt timestamp`);
        }

        // Validate messages for this chat
        const messages = this.loadLegacyMessages(chat.id);
        for (const msg of messages) {
          if (!msg.id || !msg.role) {
            errors.push(
              `Chat ${chat.id} has invalid message: ${JSON.stringify(msg)}`
            );
          }
          if (!["user", "assistant", "system"].includes(msg.role)) {
            errors.push(
              `Chat ${chat.id} has message with invalid role: ${msg.role}`
            );
          }
        }
      }

      // Validate prompts
      const prompts = this.loadLegacyPrompts();
      for (const prompt of prompts) {
        if (!prompt.id || typeof prompt.id !== "string") {
          errors.push(`Invalid prompt ID: ${JSON.stringify(prompt)}`);
        }
        if (typeof prompt.content !== "string") {
          errors.push(`Prompt ${prompt.id} has invalid content type`);
        }
      }
    } catch (err) {
      errors.push(`Validation error: ${String(err)}`);
    }

    return errors;
  }
}

export const localStorageMigrator = new LocalStorageMigrator();
