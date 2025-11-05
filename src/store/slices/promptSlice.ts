import { StateCreator } from "zustand";
import { UserSystemPrompt } from "../../types/chat";
import { SystemPromptService } from "../../services/SystemPromptService";
import { backendContextService } from "../../services/BackendContextService";
import type { AppState } from "../";

const LAST_SELECTED_PROMPT_ID_LS_KEY = "copilot_last_selected_prompt_id";
const systemPromptService = SystemPromptService.getInstance();

// Helper function to generate ID from name
function generateIdFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface PromptSlice {
  // State
  systemPrompts: UserSystemPrompt[];
  lastSelectedPromptId: string | null;

  // Actions
  loadSystemPrompts: () => Promise<void>;
  addSystemPrompt: (prompt: Omit<UserSystemPrompt, "id">) => Promise<void>;
  updateSystemPrompt: (prompt: UserSystemPrompt) => Promise<void>;
  deleteSystemPrompt: (promptId: string) => Promise<void>;
  setLastSelectedPromptId: (promptId: string) => void;
}

export const createPromptSlice: StateCreator<AppState, [], [], PromptSlice> = (
  set,
  get,
) => ({
  // Initial state
  systemPrompts: [],
  lastSelectedPromptId:
    localStorage.getItem(LAST_SELECTED_PROMPT_ID_LS_KEY) || null,

  // System prompt management
  loadSystemPrompts: async () => {
    try {
      const presets = await systemPromptService.getSystemPromptPresets();
      const prompts: UserSystemPrompt[] = presets.map((p: any) => ({
        id: p.id,
        name: p.name,
        content: p.content,
        description: p.description,
        isDefault: Boolean(p.isDefault),
      }));
      set({ systemPrompts: prompts });
      console.log("Loaded system prompts from backend:", prompts);
    } catch (error) {
      console.error("Failed to load system prompts from backend:", error);
      set({ systemPrompts: [] });
    }
  },

  addSystemPrompt: async (promptData) => {
    try {
      // Generate ID from name if not provided
      const id = generateIdFromName(promptData.name);

      // Call backend to create prompt
      await backendContextService.createSystemPrompt(id, promptData.content);

      // Refresh the list to get the latest prompts
      await get().loadSystemPrompts();

      console.log("System prompt added successfully:", id);
    } catch (error) {
      console.error("Failed to add system prompt:", error);
      throw error;
    }
  },

  updateSystemPrompt: async (promptToUpdate) => {
    try {
      // Call backend to update prompt
      await backendContextService.updateSystemPrompt(
        promptToUpdate.id,
        promptToUpdate.content,
      );

      // Refresh the list to get the latest prompts
      await get().loadSystemPrompts();

      console.log("System prompt updated successfully:", promptToUpdate.id);
    } catch (error) {
      console.error("Failed to update system prompt:", error);
      throw error;
    }
  },

  deleteSystemPrompt: async (promptId) => {
    try {
      // Prevent deletion of default prompt
      if (promptId === "general_assistant") {
        throw new Error("Cannot delete the default system prompt");
      }

      // Call backend to delete prompt
      await backendContextService.deleteSystemPrompt(promptId);

      // Refresh the list to get the latest prompts
      await get().loadSystemPrompts();

      console.log("System prompt deleted successfully:", promptId);
    } catch (error) {
      console.error("Failed to delete system prompt:", error);
      throw error;
    }
  },

  setLastSelectedPromptId: (promptId: string) => {
    set({ lastSelectedPromptId: promptId });
    try {
      localStorage.setItem(LAST_SELECTED_PROMPT_ID_LS_KEY, promptId);
    } catch (error) {
      console.error(
        "Failed to save last selected prompt ID to localStorage:",
        error,
      );
    }
  },
});
