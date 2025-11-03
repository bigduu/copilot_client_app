const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

/**
 * SystemPromptService - Simplified version
 * Gets system prompts directly from SystemPromptService backend API
 * No longer depends on ToolCategory system
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
   * Get system prompts directly from SystemPromptService
   * No longer depends on tool categories
   */
  async getSystemPromptPresets(): Promise<any[]> {
    try {
      // Call backend system prompt service directly
      const response = await fetch("http://127.0.0.1:8080/v1/system-prompts");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Handle both { prompts: [...] } and [...] formats
      const prompts = Array.isArray(data) ? data : (data.prompts || []);

      // Convert to preset format for backward compatibility
      const presets = prompts.map((prompt: any) => {
        return {
          id: prompt.id,
          name: prompt.id, // Use ID as name if no display name
          content: prompt.content || "",
          description: prompt.id, // Use ID as description if no description
          category: prompt.id, // For backward compatibility
          mode: "general", // Default to general mode
          autoToolPrefix: undefined,
          allowedTools: [],
          restrictConversation: false,
          isDefault: prompt.id === "general_assistant", // Mark general_assistant as default
        };
      });

      return presets;
    } catch (error) {
      console.error("Failed to get system prompts from backend:", error);
      // Return empty array instead of throwing to prevent UI breaking
      // The user can still create chats without a system prompt
      console.warn("Returning empty prompts array due to error");
      return [];
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
   * Deprecated: Tool-specific mode is no longer supported
   * Always returns false
   */
  async isToolSpecificMode(_presetId: string): Promise<boolean> {
    return false;
  }

  /**
   * Deprecated: Allowed tools list is no longer supported
   * Returns empty array
   */
  async getAllowedTools(_presetId: string): Promise<string[]> {
    return [];
  }

  /**
   * Deprecated: Auto tool prefix is no longer supported
   * Returns undefined
   */
  async getAutoToolPrefix(_presetId: string): Promise<string | undefined> {
    return undefined;
  }

  /**
   * Deprecated: Conversation restriction is no longer supported
   * Always returns false
   */
  async isConversationRestricted(_presetId: string): Promise<boolean> {
    return false;
  }

  /**
   * Get enhanced system prompt from backend
   * The backend handles tool injection and Mermaid support
   */
  async getEnhancedSystemPrompt(promptId: string): Promise<string> {
    try {
      console.log(`[SystemPromptService] Fetching enhanced prompt for ID: ${promptId}`);
      const response = await fetch(`http://127.0.0.1:8080/v1/system-prompts/${promptId}/enhanced`);
      
      if (response.status === 404) {
        console.warn(`[SystemPromptService] Prompt not found: ${promptId}, falling back to base content`);
        // Fall back to getting the base content
        const preset = await this.findPresetById(promptId);
        return preset?.content || "";
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[SystemPromptService] Enhanced prompt fetched successfully`);
      return data.content || "";
    } catch (error) {
      console.error(`[SystemPromptService] Failed to get enhanced prompt for ${promptId}:`, error);
      // Fall back to base content on error
      const preset = await this.findPresetById(promptId);
      return preset?.content || "";
    }
  }

  /**
   * Get enhanced system prompt from base content
   * For cases where we have content but no prompt ID
   * Fallback: returns the base content as-is if backend enhancement fails
   */
  async getEnhancedSystemPromptFromContent(baseContent: string): Promise<string> {
    console.log(`[SystemPromptService] Enhancing prompt content directly`);
    // Since backend requires a prompt ID, we can't enhance arbitrary content
    // Just return the base content and rely on backend's automatic enhancement during chat
    console.warn(`[SystemPromptService] Direct content enhancement not supported, using base content`);
    return baseContent;
  }
}
