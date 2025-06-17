/**
 * Tool category type definitions
 * Matches backend ToolCategory structure
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
  category_type: string; // 完全由后端控制，不再硬编码类型
}

/**
 * Message validation result
 */
export interface MessageValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * Tool category service
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
   * Validate if message format meets strict mode requirements
   */
  validateMessageForStrictMode(
    message: string,
    categoryInfo: ToolCategoryInfo | null
  ): MessageValidationResult {
    // If no category info or strict mode not enabled, allow all messages
    if (!categoryInfo || !categoryInfo.strict_tools_mode) {
      return { isValid: true };
    }

    const trimmedMessage = message.trim();

    // In strict mode, message must start with /
    if (!trimmedMessage.startsWith("/")) {
      return {
        isValid: false,
        errorMessage: `In strict mode, only tool calls are allowed. Please input tool commands starting with /`,
      };
    }

    // Check message length (must have at least tool name)
    if (trimmedMessage.length <= 1) {
      return {
        isValid: false,
        errorMessage: `Please input complete tool call command, format: /tool_name parameters`,
      };
    }

    return { isValid: true };
  }

  /**
   * Check if message is valid tool call format
   */
  isValidToolCallFormat(message: string): boolean {
    const trimmed = message.trim();
    return trimmed.startsWith("/") && trimmed.length > 1;
  }

  /**
   * Get strict mode error message
   */
  getStrictModeErrorMessage(categoryInfo: ToolCategoryInfo): string {
    const categoryName = categoryInfo.name || "Current Category";
    return `${categoryName} has strict mode enabled, only tool call commands starting with / are allowed`;
  }

  /**
   * Get strict mode input placeholder
   */
  getStrictModePlaceholder(categoryInfo: ToolCategoryInfo): string {
    const categoryName = categoryInfo.name || "Current Category";
    return `${categoryName} - Strict Mode: Please input tool call (format: /tool_name parameters)`;
  }
}
