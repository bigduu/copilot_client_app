import { UserSystemPrompt } from "../types/chat";

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
      const storedPrompt = localStorage.getItem(SYSTEM_PROMPT_KEY);
      if (!storedPrompt) {
        throw new Error(
          "System prompt not configured, please configure it first"
        );
      }
      return storedPrompt;
    } catch (error) {
      console.error("Error loading global system prompt:", error);
      throw new Error(
        "System prompt not configured, please configure it first"
      );
    }
  }

  /**
   * Update global system prompt (maintain backward compatibility)
   */
  updateGlobalSystemPrompt(prompt: string): void {
    try {
      if (!prompt || !prompt.trim()) {
        throw new Error("System prompt cannot be empty");
      }
      localStorage.setItem(SYSTEM_PROMPT_KEY, prompt.trim());
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
      const id = localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY);
      if (!id) {
        throw new Error(
          "System prompt preset ID not set, must be configured from the backend first"
        );
      }
      return id;
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      throw new Error(
        "System prompt preset ID configuration is missing, no frontend default is provided"
      );
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
  async getSystemPromptPresets(): Promise<any[]> {
    try {
      // Call backend web service to get tool categories
      const response = await fetch("http://localhost:8080/tools/categories");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const categoryInfos = await response.json();

      const presets = categoryInfos.map((info: any) => {
        const category = info.category;
        const promptContent =
          typeof category.system_prompt === "object" &&
          category.system_prompt !== null
            ? category.system_prompt.content
            : category.system_prompt;

        return {
          id: category.id,
          name: category.display_name,
          content: promptContent || "",
          description: category.description,
          category: category.id,
          mode: category.strict_tools_mode ? "tool_specific" : "general",
          autoToolPrefix: category.auto_tool_prefix,
          allowedTools: info.tools.map((t: any) => t.name) || [],
          restrictConversation: category.restrict_conversation,
          isDefault: category.is_default,
        };
      });

      return presets;
    } catch (error) {
      console.error("Failed to get categories from backend:", error);
      throw new Error(
        "Cannot get system prompt preset configuration from the backend, no default configuration is provided on the frontend"
      );
    }
  }

  /**
   * Default preset configuration has been removed - frontend relies entirely on backend for configuration
   * No longer provides any hardcoded default values
   */

  /**
   * Find preset by preset ID
   */
  async findPresetById(id: string): Promise<any | undefined> {
    const presets = await this.getSystemPromptPresets();
    return presets.find((preset: any) => preset.id === id);
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
  async getPresetsByCategory(category: string): Promise<any[]> {
    const presets = await this.getSystemPromptPresets();
    return presets.filter((preset: any) => preset.category === category);
  }
}
