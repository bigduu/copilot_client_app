import { invoke } from "@tauri-apps/api/core";

// 工具类别枚举，匹配 Rust 端
export enum ToolCategory {
  FileRead = 'FileRead',
  FileCreate = 'FileCreate', 
  FileDelete = 'FileDelete',
  FileUpdate = 'FileUpdate',
  FileSearch = 'FileSearch',
  CommandExecution = 'CommandExecution',
  GeneralAssistant = 'GeneralAssistant',
}

// 工具配置接口，匹配 Rust 结构
export interface ToolConfig {
  name: string;
  display_name: string;
  description: string;
  category: ToolCategory;
  enabled: boolean;
  requires_approval: boolean;
  auto_prefix?: string;
  permissions: string[];
  tool_type: string;
  parameter_regex?: string;
  custom_prompt?: string;
}

// 工具配置服务类
export class ToolConfigService {
  private static instance: ToolConfigService;

  static getInstance(): ToolConfigService {
    if (!ToolConfigService.instance) {
      ToolConfigService.instance = new ToolConfigService();
    }
    return ToolConfigService.instance;
  }

  /**
   * 获取所有可用的工具配置
   */
  async getAvailableToolConfigs(): Promise<ToolConfig[]> {
    try {
      return await invoke<ToolConfig[]>("get_available_tool_configs");
    } catch (error) {
      console.error("Failed to get available tool configs:", error);
      throw new Error(`Failed to get available tool configs: ${error}`);
    }
  }

  /**
   * 根据名称获取工具配置
   */
  async getToolConfig(toolName: string): Promise<ToolConfig | null> {
    try {
      return await invoke<ToolConfig | null>("get_tool_config_by_name", { toolName });
    } catch (error) {
      console.error("Failed to get tool config:", error);
      throw new Error(`Failed to get tool config: ${error}`);
    }
  }

  /**
   * 更新工具配置
   */
  async updateToolConfig(toolName: string, config: ToolConfig): Promise<void> {
    try {
      await invoke<void>("update_tool_config_by_name", { toolName, config });
    } catch (error) {
      console.error("Failed to update tool config:", error);
      throw new Error(`Failed to update tool config: ${error}`);
    }
  }

  /**
   * 获取工具分类列表
   */
  async getToolCategories(): Promise<ToolCategory[]> {
    try {
      return await invoke<ToolCategory[]>("get_tool_categories_list");
    } catch (error) {
      console.error("Failed to get tool categories:", error);
      throw new Error(`Failed to get tool categories: ${error}`);
    }
  }

  /**
   * 根据分类获取工具
   */
  async getToolsByCategory(category: ToolCategory): Promise<ToolConfig[]> {
    try {
      return await invoke<ToolConfig[]>("get_tools_by_category", { category });
    } catch (error) {
      console.error("Failed to get tools by category:", error);
      throw new Error(`Failed to get tools by category: ${error}`);
    }
  }

  /**
   * 检查工具是否启用
   */
  async isToolEnabled(toolName: string): Promise<boolean> {
    try {
      return await invoke<boolean>("is_tool_enabled_check", { toolName });
    } catch (error) {
      console.error("Failed to check if tool is enabled:", error);
      return false;
    }
  }

  /**
   * 检查工具是否需要审批
   */
  async toolRequiresApproval(toolName: string): Promise<boolean> {
    try {
      return await invoke<boolean>("tool_requires_approval_check", { toolName });
    } catch (error) {
      console.error("Failed to check if tool requires approval:", error);
      return true; // 默认需要审批
    }
  }

  /**
   * 获取工具权限列表
   */
  async getToolPermissions(toolName: string): Promise<string[]> {
    try {
      return await invoke<string[]>("get_tool_permissions", { toolName });
    } catch (error) {
      console.error("Failed to get tool permissions:", error);
      return [];
    }
  }

  /**
   * 重置工具配置为默认值
   */
  async resetToDefaults(): Promise<void> {
    try {
      await invoke<void>("reset_tool_configs_to_defaults");
    } catch (error) {
      console.error("Failed to reset tool configs:", error);
      throw new Error(`Failed to reset tool configs: ${error}`);
    }
  }

  /**
   * 导出工具配置为 JSON
   */
  async exportConfigs(): Promise<string> {
    try {
      return await invoke<string>("export_tool_configs");
    } catch (error) {
      console.error("Failed to export tool configs:", error);
      throw new Error(`Failed to export tool configs: ${error}`);
    }
  }

  /**
   * 从 JSON 导入工具配置
   */
  async importConfigs(jsonContent: string): Promise<void> {
    try {
      await invoke<void>("import_tool_configs", { jsonContent });
    } catch (error) {
      console.error("Failed to import tool configs:", error);
      throw new Error(`Failed to import tool configs: ${error}`);
    }
  }

  /**
   * 将工具类别转换为前端字符串格式
   */
  categoryToString(category: ToolCategory): string {
    switch (category) {
      case ToolCategory.FileRead:
        return "file_reader";
      case ToolCategory.FileCreate:
        return "file_creator";
      case ToolCategory.FileDelete:
        return "file_deleter";
      case ToolCategory.FileUpdate:
        return "file_updater";
      case ToolCategory.FileSearch:
        return "file_searcher";
      case ToolCategory.CommandExecution:
        return "command_execution";
      case ToolCategory.GeneralAssistant:
        return "general";
      default:
        return "general";
    }
  }

  /**
   * 从字符串转换为工具类别
   */
  stringToCategory(categoryStr: string): ToolCategory {
    switch (categoryStr) {
      case "file_reader":
        return ToolCategory.FileRead;
      case "file_creator":
        return ToolCategory.FileCreate;
      case "file_deleter":
        return ToolCategory.FileDelete;
      case "file_updater":
        return ToolCategory.FileUpdate;
      case "file_searcher":
        return ToolCategory.FileSearch;
      case "command_execution":
        return ToolCategory.CommandExecution;
      case "general":
        return ToolCategory.GeneralAssistant;
      default:
        return ToolCategory.GeneralAssistant;
    }
  }

  /**
   * 获取分类的显示名称
   */
  getCategoryDisplayName(category: ToolCategory): string {
    switch (category) {
      case ToolCategory.FileRead:
        return "文件读取";
      case ToolCategory.FileCreate:
        return "文件创建";
      case ToolCategory.FileDelete:
        return "文件删除";
      case ToolCategory.FileUpdate:
        return "文件更新";
      case ToolCategory.FileSearch:
        return "文件搜索";
      case ToolCategory.CommandExecution:
        return "命令执行";
      case ToolCategory.GeneralAssistant:
        return "通用助手";
      default:
        return "未知类别";
    }
  }

  /**
   * 根据工具名称推断类别
   */
  inferCategoryFromToolName(toolName: string): ToolCategory {
    if (toolName.includes("read")) return ToolCategory.FileRead;
    if (toolName.includes("create")) return ToolCategory.FileCreate;
    if (toolName.includes("delete")) return ToolCategory.FileDelete;
    if (toolName.includes("update") || toolName.includes("append")) return ToolCategory.FileUpdate;
    if (toolName.includes("search")) return ToolCategory.FileSearch;
    if (toolName.includes("command") || toolName.includes("execute")) return ToolCategory.CommandExecution;
    return ToolCategory.GeneralAssistant;
  }
}