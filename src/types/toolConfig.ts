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
   * Update tool configuration (dynamic updates are not supported in the new architecture; tool configuration is managed by categories)
   */
  async updateToolConfig(_toolName: string, _config: ToolConfig): Promise<void> {
    console.warn("Tool config updates are not supported in the new category-based architecture");
    throw new Error("Tool configuration updates are managed through categories and cannot be modified at runtime");
  }

  /**
   * Get tool category list
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
   * Get tools by category
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
   * Check if a tool is enabled (by checking if the tool exists in the categories)
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
   * Check if a tool requires approval
   */
  async toolRequiresApproval(toolName: string): Promise<boolean> {
    try {
      const toolConfig = await this.getToolConfig(toolName);
      return toolConfig?.requires_approval || false;
    } catch (error) {
      console.error("Failed to check if tool requires approval:", error);
      return true; // default to requiring approval
    }
  }

  /**
   * Get tool permission list
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
   * Get the display name for a category (dynamically fetched from backend data)
   * If backend data is unavailable, provide a default mapping
   */
  getCategoryDisplayName(categoryId: string, categoriesData?: ToolCategoryInfo[]): string {
    // The display name must be obtained from the backend data
    if (categoriesData) {
      const category = categoriesData.find(cat => cat.id === categoryId);
      if (category) {
        return category.name || category.id;
      }
    }
    
    // The frontend does not provide any default mapping; it must be obtained from the backend
    throw new Error(`The display name for tool category "${categoryId}" must be obtained from the backend configuration; no default value is provided on the frontend`);
  }

  /**
   * Infer category from tool name (dynamic handling, no hardcoded category list)
   * This method should be gradually deprecated in favor of relying entirely on backend classification
   */
  inferCategoryFromToolName(toolName: string): string {
    // This method is deprecated - tool classification must be provided entirely by the backend
    throw new Error(`The category for tool "${toolName}" must be obtained from the backend; the frontend does not provide inference logic`);
  }
}
