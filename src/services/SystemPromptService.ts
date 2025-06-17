import {
  SystemPromptPreset,
  SystemPromptPresetList,
} from "../types/chat";
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
      const storedPrompt = localStorage.getItem(SYSTEM_PROMPT_KEY);
      if (!storedPrompt) {
        throw new Error("系统提示词未配置，请先配置系统提示词");
      }
      return storedPrompt;
    } catch (error) {
      console.error("Error loading global system prompt:", error);
      throw new Error("系统提示词未配置，请先配置系统提示词");
    }
  }

  /**
   * Update global system prompt (maintain backward compatibility)
   */
  updateGlobalSystemPrompt(prompt: string): void {
    try {
      if (!prompt || !prompt.trim()) {
        throw new Error("系统提示词不能为空");
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
        throw new Error("未设置系统提示预设ID，必须先从后端配置");
      }
      return id;
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      throw new Error("系统提示预设ID配置缺失，前端不提供默认值");
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
        return {
          id: category.id,
          name: category.name,
          content: category.system_prompt,
          description: category.description,
          category: category.id, // 直接使用后端的类别 ID，不再进行映射
          mode: category.restrict_conversation ? "tool_specific" : "general",
          autoToolPrefix: category.auto_prefix,
          allowedTools: category.tools || [],
          restrictConversation: category.restrict_conversation,
        };
      });

      return presets;
    } catch (error) {
      console.error("Failed to get categories from backend:", error);
      throw new Error("无法从后端获取系统提示预设配置，前端不提供默认配置");
    }
  }

  /**
   * 已删除默认预设配置 - 前端完全依赖后端提供配置
   * 不再提供任何硬编码的默认值
   */


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
