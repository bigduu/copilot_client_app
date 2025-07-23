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
   * Get all available tool configurations from all categories
   */
  async getAvailableToolConfigs(): Promise<ToolConfig[]> {
    try {
      // Get all categories first
      const categories = await invoke<any[]>("get_tool_categories");

      // Get tools from each category
      const allTools: ToolConfig[] = [];
      for (const category of categories) {
        const categoryTools = await invoke<ToolConfig[]>("get_category_tools", {
          categoryId: category.id,
        });
        allTools.push(...categoryTools);
      }

      return allTools;
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
      // Get all tool configs and find the specific one
      const allConfigs = await this.getAvailableToolConfigs();
      return allConfigs.find(config => config.name === toolName) || null;
    } catch (error) {
      console.error("Failed to get tool config:", error);
      throw new Error(`Failed to get tool config: ${error}`);
    }
  }

  /**
   * 更新工具配置 (新架构中不支持动态更新，工具配置由categories管理)
   */
  async updateToolConfig(toolName: string, config: ToolConfig): Promise<void> {
    console.warn("Tool config updates are not supported in the new category-based architecture");
    throw new Error("Tool configuration updates are managed through categories and cannot be modified at runtime");
  }

  /**
   * 获取工具分类列表
   */
  async getToolCategories(): Promise<ToolCategoryInfo[]> {
    try {
      return await invoke<ToolCategoryInfo[]>("get_tool_categories");
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
      return await invoke<ToolConfig[]>("get_category_tools", {
        categoryId,
      });
    } catch (error) {
      console.error("Failed to get tools by category:", error);
      throw new Error(`Failed to get tools by category: ${error}`);
    }
  }

  /**
   * 检查工具是否启用 (通过检查工具是否存在于categories中)
   */
  async isToolEnabled(toolName: string): Promise<boolean> {
    try {
      const allConfigs = await this.getAvailableToolConfigs();
      return allConfigs.some(config => config.name === toolName && config.enabled);
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
      const toolConfig = await this.getToolConfig(toolName);
      return toolConfig?.requires_approval || false;
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
      const toolConfig = await this.getToolConfig(toolName);
      return toolConfig?.permissions || [];
    } catch (error) {
      console.error("Failed to get tool permissions:", error);
      return [];
    }
  }

  // Configuration management methods are not supported in the new category-based architecture
  // Tool configurations are managed through categories and cannot be modified at runtime

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
