import { invoke } from "@tauri-apps/api/core";
import { ToolCategoryInfo } from "./toolCategory";

/**
 * Tool configuration interface
 */
export interface ToolConfig {
  name: string;
  display_name: string;
  description: string;
  category: string; // Changed to string type to maintain consistency with backend
  enabled: boolean;
  requires_approval: boolean;
  auto_prefix?: string;
  permissions: string[];
  tool_type: string;
  parameter_regex?: string;
  custom_prompt?: string;
}

/**
 * Tool configuration service class
 */
export class ToolConfigService {
  private static instance: ToolConfigService;

  static getInstance(): ToolConfigService {
    if (!ToolConfigService.instance) {
      ToolConfigService.instance = new ToolConfigService();
    }
    return ToolConfigService.instance;
  }

  /**
   * Get all available tool configurations
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
   * Get configuration by tool name
   */
  async getToolConfig(toolName: string): Promise<ToolConfig | null> {
    try {
      return await invoke<ToolConfig | null>("get_tool_config_by_name", {
        toolName,
      });
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
  async getToolCategories(): Promise<ToolCategoryInfo[]> {
    try {
      return await invoke<ToolCategoryInfo[]>("get_tool_categories_list");
    } catch (error) {
      console.error("Failed to get tool categories:", error);
      throw new Error(`Failed to get tool categories: ${error}`);
    }
  }

  /**
   * 根据分类获取工具
   */
  async getToolsByCategory(categoryId: string): Promise<ToolConfig[]> {
    try {
      return await invoke<ToolConfig[]>("get_tools_by_category", {
        categoryId,
      });
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
      return await invoke<boolean>("tool_requires_approval_check", {
        toolName,
      });
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
   * 获取分类的显示名称（动态从后端数据获取）
   * 如果后端数据不可用，提供默认映射
   */
  getCategoryDisplayName(categoryId: string, categoriesData?: ToolCategoryInfo[]): string {
    // 必须从后端数据获取显示名称
    if (categoriesData) {
      const category = categoriesData.find(cat => cat.id === categoryId);
      if (category) {
        return category.name || category.id;
      }
    }
    
    // 前端不提供任何默认映射，必须从后端获取
    throw new Error(`工具类别 "${categoryId}" 的显示名称必须从后端配置获取，前端不提供默认值`);
  }

  /**
   * 根据工具名称推断类别（动态处理，不硬编码类别列表）
   * 这个方法应该逐步废弃，改为完全依赖后端分类
   */
  inferCategoryFromToolName(toolName: string): string {
    // 此方法已废弃 - 工具分类必须完全由后端提供
    throw new Error(`工具 "${toolName}" 的类别分类必须从后端获取，前端不提供推断逻辑`);
  }
}
