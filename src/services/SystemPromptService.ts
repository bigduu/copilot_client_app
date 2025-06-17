import {
  SystemPromptPreset,
  SystemPromptPresetList,
  TOOL_CATEGORIES,
} from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";
import { invoke } from "@tauri-apps/api/core";

const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

/**
 * SystemPromptService - Simplified version
 * Focuses on getting ToolCategory configuration from backend, removes frontend management features
 */
export class SystemPromptService {
  private static instance: SystemPromptService;

  private constructor() {}

  static getInstance(): SystemPromptService {
    if (!SystemPromptService.instance) {
      SystemPromptService.instance = new SystemPromptService();
    }
    return SystemPromptService.instance;
  }

  /**
   * Get global system prompt (maintain backward compatibility)
   */
  getGlobalSystemPrompt(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
    } catch (error) {
      console.error("Error loading global system prompt:", error);
      return DEFAULT_MESSAGE;
    }
  }

  /**
   * Update global system prompt (maintain backward compatibility)
   */
  updateGlobalSystemPrompt(prompt: string): void {
    try {
      const promptToSave = prompt && prompt.trim() ? prompt : DEFAULT_MESSAGE;
      localStorage.setItem(SYSTEM_PROMPT_KEY, promptToSave);
      console.log("Global system prompt updated successfully");
    } catch (error) {
      console.error("Error saving system prompt:", error);
    }
  }

  /**
   * Get currently selected preset ID
   */
  getSelectedSystemPromptPresetId(): string {
    try {
      return (
        localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY) ||
        "general-assistant"
      );
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      return "general-assistant";
    }
  }

  /**
   * Set currently selected preset ID
   */
  setSelectedSystemPromptPresetId(id: string): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, id);
    } catch (error) {
      console.error("Error saving selected system prompt preset ID:", error);
    }
  }

  /**
   * Get ToolCategory configuration from backend to generate preset list
   */
  async getSystemPromptPresets(): Promise<SystemPromptPresetList> {
    try {
      // Call backend API to get tool categories
      const categories = await invoke<any[]>("get_tool_categories");

      const presets: SystemPromptPresetList = categories.map((category) => {
        // Map backend category ID to frontend enum
        const frontendCategory = this.mapBackendCategoryToFrontend(category.id);

        return {
          id: category.id,
          name: category.name,
          content: category.system_prompt,
          description: category.description,
          category: frontendCategory,
          mode: category.restrict_conversation ? "tool_specific" : "general",
          autoToolPrefix: category.auto_prefix,
          allowedTools: category.tools || [],
          restrictConversation: category.restrict_conversation,
        };
      });

      return presets;
    } catch (error) {
      console.error("Failed to get categories from backend:", error);
      // Fallback to default presets
      return this.getDefaultPresets();
    }
  }

  /**
   * Get default presets (fallback solution)
   */
  private getDefaultPresets(): SystemPromptPresetList {
    return [
      {
        id: "general_assistant",
        name: "General Assistant",
        content:
          "You are a general AI assistant. You can engage in natural conversation, answer various questions, use appropriate tools as needed, and provide comprehensive help and advice.",
        description:
          "Provides general conversation and assistance functions without restricting specific tool usage",
        category: TOOL_CATEGORIES.GENERAL,
        mode: "general",
      },
      {
        id: "file_operations",
        name: "File Operations Assistant",
        content:
          "You are a professional file operations assistant. Your task is to help users with file reading, creation, updating, deletion, and search operations.",
        description:
          "Specialized for various file operations including reading, creating, updating, deleting, and searching",
        category: TOOL_CATEGORIES.FILE_READER,
        mode: "tool_specific",
        autoToolPrefix: "Please help me with file operations:",
        allowedTools: [
          "read_file",
          "create_file",
          "update_file",
          "delete_file",
          "search_files",
          "simple_search",
          "append_file",
        ],
        restrictConversation: true,
      },
      {
        id: "command_execution",
        name: "Command Execution Assistant",
        content:
          "You are a professional command execution assistant. Your task is to help users execute system commands and scripts.",
        description: "Specialized for executing system commands and scripts",
        category: TOOL_CATEGORIES.COMMAND_EXECUTOR,
        mode: "tool_specific",
        autoToolPrefix: "Please help me execute commands:",
        allowedTools: ["execute_command"],
        restrictConversation: true,
      },
    ];
  }

  /**
   * Map backend category ID to frontend constants
   */
  private mapBackendCategoryToFrontend(backendId: string): string {
    switch (backendId) {
      case "file_operations":
        return TOOL_CATEGORIES.FILE_READER;
      case "command_execution":
        return TOOL_CATEGORIES.COMMAND_EXECUTOR;
      case "general_assistant":
        return TOOL_CATEGORIES.GENERAL;
      default:
        return TOOL_CATEGORIES.GENERAL;
    }
  }

  /**
   * Find preset by preset ID
   */
  async findPresetById(id: string): Promise<SystemPromptPreset | undefined> {
    const presets = await this.getSystemPromptPresets();
    return presets.find((preset) => preset.id === id);
  }

  /**
   * Get current system prompt content
   */
  async getCurrentSystemPromptContent(
    selectedPresetId: string
  ): Promise<string> {
    const preset = await this.findPresetById(selectedPresetId);
    if (preset) return preset.content;

    // Fallback to global system prompt
    return this.getGlobalSystemPrompt();
  }

  /**
   * Check if in tool-specific mode
   */
  async isToolSpecificMode(presetId: string): Promise<boolean> {
    const preset = await this.findPresetById(presetId);
    return preset?.mode === "tool_specific";
  }

  /**
   * Get allowed tools list
   */
  async getAllowedTools(presetId: string): Promise<string[]> {
    const preset = await this.findPresetById(presetId);
    return preset?.allowedTools || [];
  }

  /**
   * Get auto tool prefix
   */
  async getAutoToolPrefix(presetId: string): Promise<string | undefined> {
    const preset = await this.findPresetById(presetId);
    return preset?.autoToolPrefix;
  }

  /**
   * Check if normal conversation is restricted
   */
  async isConversationRestricted(presetId: string): Promise<boolean> {
    const preset = await this.findPresetById(presetId);
    return preset?.restrictConversation === true;
  }

  /**
   * Get presets by category
   */
  async getPresetsByCategory(
    category: string
  ): Promise<SystemPromptPresetList> {
    const presets = await this.getSystemPromptPresets();
    return presets.filter((preset) => preset.category === category);
  }
}
