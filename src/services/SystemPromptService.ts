import { SystemPromptPreset, SystemPromptPresetList, ToolCategory } from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";
import { invoke } from "@tauri-apps/api/core";

const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

/**
 * SystemPromptService - 简化版
 * 专注于从后端获取 ToolCategory 配置，移除前端管理功能
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
   * 获取全局系统提示词（保留向后兼容）
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
   * 更新全局系统提示词（保留向后兼容）
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
   * 获取当前选中的预设 ID
   */
  getSelectedSystemPromptPresetId(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY) || "general-assistant";
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      return "general-assistant";
    }
  }

  /**
   * 设置当前选中的预设 ID
   */
  setSelectedSystemPromptPresetId(id: string): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, id);
    } catch (error) {
      console.error("Error saving selected system prompt preset ID:", error);
    }
  }

  /**
   * 从后端获取 ToolCategory 配置生成预设列表
   */
  async getSystemPromptPresets(): Promise<SystemPromptPresetList> {
    try {
      // 调用后端 API 获取工具分类
      const categories = await invoke<any[]>("get_tool_categories");
      
      const presets: SystemPromptPresetList = categories.map(category => {
        // 映射后端分类 ID 到前端枚举
        const frontendCategory = this.mapBackendCategoryToFrontend(category.id);
        
        return {
          id: category.id,
          name: category.name,
          content: category.system_prompt,
          description: category.description,
          category: frontendCategory,
          mode: category.restrict_conversation ? 'tool_specific' : 'general',
          autoToolPrefix: category.auto_prefix,
          allowedTools: category.tools || [],
          restrictConversation: category.restrict_conversation,
        };
      });

      return presets;
    } catch (error) {
      console.error("Failed to get categories from backend:", error);
      // 降级到默认预设
      return this.getDefaultPresets();
    }
  }

  /**
   * 获取默认预设（后备方案）
   */
  private getDefaultPresets(): SystemPromptPresetList {
    return [
      {
        id: "general_assistant",
        name: "通用助手",
        content: "你是通用AI助手。你可以进行自然对话、回答各种问题、根据需要使用合适的工具、提供综合性的帮助和建议。",
        description: "提供通用的对话和协助功能，不限制特定工具使用",
        category: ToolCategory.GENERAL,
        mode: 'general'
      },
      {
        id: "file_read",
        name: "文件读取助手",
        content: "你是专业的文件读取助手。你的任务是帮助用户读取、查看和理解文件内容。",
        description: "专门用于读取和查看文件内容，支持多种文件格式",
        category: ToolCategory.FILE_READER,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我读取文件：",
        allowedTools: ['read_file'],
        restrictConversation: true
      },
      {
        id: "file_create",
        name: "文件创建助手",
        content: "你是专业的文件创建助手。你的任务是帮助用户创建新文件和目录结构。",
        description: "专门用于创建新文件和目录结构",
        category: ToolCategory.FILE_CREATOR,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我创建文件：",
        allowedTools: ['create_file'],
        restrictConversation: true
      },
      {
        id: "file_update",
        name: "文件更新助手",
        content: "你是专业的文件更新助手。你的任务是帮助用户更新和修改现有文件内容。",
        description: "专门用于更新和修改现有文件内容",
        category: ToolCategory.FILE_UPDATER,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我更新文件：",
        allowedTools: ['update_file', 'append_file'],
        restrictConversation: true
      },
      {
        id: "file_delete",
        name: "文件删除助手",
        content: "你是专业的文件删除助手。你的任务是帮助用户安全地删除文件和目录。",
        description: "专门用于安全地删除文件和目录",
        category: ToolCategory.FILE_DELETER,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我删除文件：",
        allowedTools: ['delete_file'],
        restrictConversation: true
      },
      {
        id: "file_search",
        name: "文件搜索助手",
        content: "你是专业的文件搜索助手。你的任务是帮助用户搜索和定位文件及内容。",
        description: "专门用于搜索文件和文件内容",
        category: ToolCategory.FILE_SEARCHER,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我搜索：",
        allowedTools: ['search_files', 'simple_search'],
        restrictConversation: true
      },
      {
        id: "command_execution",
        name: "命令执行助手",
        content: "你是专业的命令执行助手。你的任务是帮助用户执行系统命令和脚本。",
        description: "专门用于执行系统命令和脚本",
        category: ToolCategory.COMMAND_EXECUTOR,
        mode: 'tool_specific',
        autoToolPrefix: "请帮我执行命令：",
        allowedTools: ['execute_command'],
        restrictConversation: true
      }
    ];
  }

  /**
   * 映射后端分类 ID 到前端枚举
   */
  private mapBackendCategoryToFrontend(backendId: string): string {
    switch (backendId) {
      case "file_read": return ToolCategory.FILE_READER;
      case "file_create": return ToolCategory.FILE_CREATOR;
      case "file_delete": return ToolCategory.FILE_DELETER;
      case "file_update": return ToolCategory.FILE_UPDATER;
      case "file_search": return ToolCategory.FILE_SEARCHER;
      case "command_execution": return ToolCategory.COMMAND_EXECUTOR;
      case "general_assistant": return ToolCategory.GENERAL;
      default: return ToolCategory.GENERAL;
    }
  }

  /**
   * 根据预设 ID 查找预设
   */
  async findPresetById(id: string): Promise<SystemPromptPreset | undefined> {
    const presets = await this.getSystemPromptPresets();
    return presets.find(preset => preset.id === id);
  }

  /**
   * 获取当前系统提示词内容
   */
  async getCurrentSystemPromptContent(selectedPresetId: string): Promise<string> {
    const preset = await this.findPresetById(selectedPresetId);
    if (preset) return preset.content;
    
    // 降级到全局系统提示词
    return this.getGlobalSystemPrompt();
  }

  /**
   * 检查是否为工具专用模式
   */
  async isToolSpecificMode(presetId: string): Promise<boolean> {
    const preset = await this.findPresetById(presetId);
    return preset?.mode === 'tool_specific';
  }

  /**
   * 获取允许的工具列表
   */
  async getAllowedTools(presetId: string): Promise<string[]> {
    const preset = await this.findPresetById(presetId);
    return preset?.allowedTools || [];
  }

  /**
   * 获取自动工具前缀
   */
  async getAutoToolPrefix(presetId: string): Promise<string | undefined> {
    const preset = await this.findPresetById(presetId);
    return preset?.autoToolPrefix;
  }

  /**
   * 检查是否限制普通对话
   */
  async isConversationRestricted(presetId: string): Promise<boolean> {
    const preset = await this.findPresetById(presetId);
    return preset?.restrictConversation === true;
  }

  /**
   * 按类别获取预设
   */
  async getPresetsByCategory(category: ToolCategory): Promise<SystemPromptPresetList> {
    const presets = await this.getSystemPromptPresets();
    return presets.filter(preset => preset.category === category);
  }
}
