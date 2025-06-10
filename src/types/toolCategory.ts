/**
 * 工具类别类型定义
 * 匹配后端 ToolCategory 结构
 */

export interface ToolCategoryInfo {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
  restrict_conversation: boolean;
  enabled: boolean;
  auto_prefix?: string;
  icon?: string;
  color?: string;
  strict_tools_mode: boolean;
}

/**
 * 消息验证结果
 */
export interface MessageValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * 工具类别服务
 */
export class ToolCategoryService {
  private static instance: ToolCategoryService;

  static getInstance(): ToolCategoryService {
    if (!ToolCategoryService.instance) {
      ToolCategoryService.instance = new ToolCategoryService();
    }
    return ToolCategoryService.instance;
  }

  /**
   * 验证消息格式是否符合严格模式要求
   */
  validateMessageForStrictMode(
    message: string,
    categoryInfo: ToolCategoryInfo | null
  ): MessageValidationResult {
    // 如果没有类别信息或者没有启用严格模式，允许所有消息
    if (!categoryInfo || !categoryInfo.strict_tools_mode) {
      return { isValid: true };
    }

    const trimmedMessage = message.trim();
    
    // 严格模式下，消息必须以 / 开头
    if (!trimmedMessage.startsWith('/')) {
      return {
        isValid: false,
        errorMessage: `严格模式下只能使用工具调用，请以 / 开头输入工具命令`
      };
    }

    // 检查消息长度（至少要有工具名）
    if (trimmedMessage.length <= 1) {
      return {
        isValid: false,
        errorMessage: `请输入完整的工具调用命令，格式：/工具名 参数`
      };
    }

    return { isValid: true };
  }

  /**
   * 检查消息是否为有效的工具调用格式
   */
  isValidToolCallFormat(message: string): boolean {
    const trimmed = message.trim();
    return trimmed.startsWith('/') && trimmed.length > 1;
  }

  /**
   * 获取严格模式的错误提示消息
   */
  getStrictModeErrorMessage(categoryInfo: ToolCategoryInfo): string {
    const categoryName = categoryInfo.name || '当前类别';
    return `${categoryName}启用了严格模式，只能发送以 / 开头的工具调用命令`;
  }

  /**
   * 获取严格模式的输入提示
   */
  getStrictModePlaceholder(categoryInfo: ToolCategoryInfo): string {
    const categoryName = categoryInfo.name || '当前类别';
    return `${categoryName} - 严格模式：请输入工具调用 (格式: /工具名 参数)`;
  }
}