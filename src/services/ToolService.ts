import { invoke } from "@tauri-apps/api/core";
import { Message } from "../types/chat";
import { SystemPromptService } from "./SystemPromptService";

export interface ToolCallRequest {
  tool_name: string;
  user_description: string;
}

export interface ParameterValue {
  name: string;
  value: string;
}

export interface ToolExecutionRequest {
  tool_name: string;
  parameters: ParameterValue[];
}

export interface ToolUIInfo {
  name: string;
  description: string;
  parameters: ParameterInfo[];
  tool_type: string;
  parameter_regex?: string;
  ai_response_template?: string;
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
  type: string;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

export interface ToolConfig {
  parameterParsingRules: Record<string, ToolParameterRule>;
  resultFormattingRules: Record<string, ToolFormatRule>;
  fileExtensionMappings: Record<string, string>;
}

export interface ToolParameterRule {
  separator?: string;
  parameterNames: string[];
  fallbackBehavior?: 'error' | 'use_description';
}

export interface ToolFormatRule {
  codeLanguage: string;
  parameterExtraction?: {
    pathParam?: string;
    filePathParam?: string;
  };
}

/**
 * ToolService handles business logic for tool invocations
 * Including tool call parsing, parameter processing, tool execution, etc.
 */
export class ToolService {
  private static instance: ToolService;
  private systemPromptService: SystemPromptService;
  private toolConfig: ToolConfig | null = null;

  constructor() {
    this.systemPromptService = SystemPromptService.getInstance();
  }

  static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  /**
   * Parse tool call format (e.g., "/create_file Create a test file")
   */
  parseToolCallFormat(content: string): ToolCallRequest | null {
    if (content.startsWith("/")) {
      // Handle case where user just typed tool name without description
      const spacePos = content.indexOf(" ");
      if (spacePos !== -1) {
        const tool_name = content.slice(1, spacePos);
        const user_description = content.slice(spacePos + 1);
        return {
          tool_name,
          user_description,
        };
      } else {
        // Handle case where user just typed "/toolname" without space or description
        const tool_name = content.slice(1);
        if (tool_name.length > 0) {
          return {
            tool_name,
            user_description: "",
          };
        }
      }
    }
    return null;
  }

  /**
   * Get available tools list
   */
  async getAvailableTools(): Promise<ToolUIInfo[]> {
    try {
      return await invoke<ToolUIInfo[]>("get_tools_for_ui");
    } catch (error) {
      console.error("Failed to get available tools:", error);
      throw new Error(`Failed to get available tools: ${error}`);
    }
  }

  /**
   * Parse tool parameters using AI
   */
  async parseToolParameters(
    toolCall: ToolCallRequest,
    tool: ToolUIInfo,
    sendLLMRequest: (messages: Message[]) => Promise<string>
  ): Promise<ParameterValue[]> {
    // Build system prompt for parameter parsing
    const systemPrompt = await this.buildParameterParsingPrompt(
      tool,
      toolCall.user_description
    );

    const messages: Message[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: toolCall.user_description,
      },
    ];

    // Call LLM to parse parameters
    const aiResponse = await sendLLMRequest(messages);

    // Parse parameters returned by AI
    return await this.parseAIParameterResponse(
      aiResponse,
      tool,
      toolCall.user_description
    );
  }

  /**
   * Execute tool
   */
  async executeTool(request: ToolExecutionRequest): Promise<string> {
    try {
      return await invoke<string>("execute_tool", { request });
    } catch (error) {
      console.error("Tool execution failed:", error);
      throw new Error(`Tool execution failed: ${error}`);
    }
  }

  /**
   * 获取工具配置（从后端获取）
   */
  private async getToolConfig(): Promise<ToolConfig> {
    if (!this.toolConfig) {
      try {
        this.toolConfig = await invoke<ToolConfig>("get_tool_config");
      } catch (error) {
        throw new Error(`工具配置必须从后端获取，前端不提供硬编码配置。后端错误: ${error}`);
      }
    }
    return this.toolConfig;
  }

  /**
   * Build system prompt for parameter parsing
   */
  private async buildParameterParsingPrompt(
    tool: ToolUIInfo,
    userDescription: string
  ): Promise<string> {
    const parametersDesc = tool.parameters
      .map(
        (p) =>
          `- ${p.name}: ${p.description} (${
            p.required ? "required" : "optional"
          })`
      )
      .join("\n");

    // 获取工具参数解析规则（从后端配置获取）
    const config = await this.getToolConfig();
    const rule = config.parameterParsingRules[tool.name];
    
    if (!rule) {
      throw new Error(`工具 "${tool.name}" 的参数解析规则必须从后端配置获取，前端不提供硬编码规则`);
    }

    // 构建参数解析指导
    let parsingInstructions = "参数解析规则:\n";
    if (rule.separator) {
      parsingInstructions += `- 多个参数使用 "${rule.separator}" 分隔\n`;
    }
    parsingInstructions += `- 参数顺序: ${rule.parameterNames.join(", ")}\n`;

    return `You are a parameter parser for tool execution. Based on the user's description, extract the required parameters for the tool and return ONLY the parameter values in the exact format needed.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

${parsingInstructions}

User request: ${userDescription}

Respond with only the parameter value(s), no explanation:`;
  }

  /**
   * Parse AI parameter response
   */
  private async parseAIParameterResponse(
    aiResponse: string,
    tool: ToolUIInfo,
    userDescription: string
  ): Promise<ParameterValue[]> {
    const trimmedResponse = aiResponse.trim();

    if (!trimmedResponse) {
      throw new Error("AI returned empty parameters");
    }

    const parameters: ParameterValue[] = [];

    // 获取工具参数解析规则（从后端配置获取）
    const config = await this.getToolConfig();
    const rule = config.parameterParsingRules[tool.name];
    
    if (!rule) {
      throw new Error(`工具 "${tool.name}" 的参数解析规则必须从后端配置获取，前端不提供硬编码解析逻辑`);
    }

    // 根据配置规则解析参数
    if (rule.separator && trimmedResponse.includes(rule.separator)) {
      const parts = trimmedResponse.split(rule.separator);
      if (parts.length >= rule.parameterNames.length) {
        rule.parameterNames.forEach((paramName, index) => {
          if (parts[index]) {
            parameters.push({
              name: paramName,
              value: parts[index].trim(),
            });
          }
        });
      } else {
        // 参数不足时的处理
        if (rule.fallbackBehavior === 'error') {
          throw new Error(`工具 "${tool.name}" 需要 ${rule.parameterNames.length} 个参数，但只解析到 ${parts.length} 个`);
        } else if (rule.fallbackBehavior === 'use_description') {
          // 使用用户描述作为后备
          rule.parameterNames.forEach((paramName, index) => {
            parameters.push({
              name: paramName,
              value: parts[index] ? parts[index].trim() : userDescription,
            });
          });
        } else {
          throw new Error(`工具 "${tool.name}" 的回退行为配置无效，必须从后端重新配置`);
        }
      }
    } else {
      // 单参数情况
      if (rule.parameterNames.length > 0) {
        parameters.push({
          name: rule.parameterNames[0],
          value: trimmedResponse,
        });
      } else {
        throw new Error(`工具 "${tool.name}" 的参数名称配置缺失，必须从后端配置获取`);
      }
    }

    return parameters;
  }

  /**
   * Format tool execution result
   */
  async formatToolResult(
    toolName: string,
    parameters: ParameterValue[],
    result: string
  ): Promise<string> {
    const paramStr = parameters.map((p) => `${p.name}: ${p.value}`).join(", ");

    // 获取工具结果格式化规则（从后端配置获取）
    const config = await this.getToolConfig();
    const formatRule = config.resultFormattingRules[toolName];
    
    if (!formatRule) {
      throw new Error(`工具 "${toolName}" 的结果格式化规则必须从后端配置获取，前端不提供硬编码格式化逻辑`);
    }

    let codeLanguage = formatRule.codeLanguage;

    // 如果配置支持文件扩展名推断
    if (formatRule.parameterExtraction) {
      const pathParamName = formatRule.parameterExtraction.pathParam || formatRule.parameterExtraction.filePathParam;
      if (pathParamName) {
        const fileParam = parameters.find((p) => p.name === pathParamName);
        if (fileParam) {
          const ext = fileParam.value.split(".").pop()?.toLowerCase();
          if (ext && config.fileExtensionMappings[ext]) {
            codeLanguage = config.fileExtensionMappings[ext];
          }
        }
      }
    }

    return `**Tool: ${toolName}**

**Parameters:** ${paramStr}

**Result:**
\`\`\`${codeLanguage}
${result}
\`\`\``;
  }

  /**
   * Check if tool exists
   */
  async toolExists(toolName: string): Promise<boolean> {
    try {
      const tools = await this.getAvailableTools();
      return tools.some((tool) => tool.name === toolName);
    } catch (error) {
      console.error("Failed to check tool existence:", error);
      return false;
    }
  }

  /**
   * Get tool information
   */
  async getToolInfo(toolName: string): Promise<ToolUIInfo | null> {
    try {
      const tools = await this.getAvailableTools();
      const tool = tools.find((tool) => tool.name === toolName);
      if (!tool) {
        throw new Error(`工具 "${toolName}" 不存在，请检查工具是否已在后端正确注册`);
      }
      return tool;
    } catch (error) {
      console.error("Failed to get tool info:", error);
      throw new Error(`获取工具 "${toolName}" 信息失败: ${error}`);
    }
  }

  /**
   * Check tool call permissions
   */
  async checkToolPermission(
    toolName: string,
    systemPromptId: string
  ): Promise<boolean> {
    if (!systemPromptId) {
      // 严格模式：没有系统提示时不应该有默认行为
      throw new Error("系统提示词ID必须提供，不能使用默认权限配置");
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`系统提示词预设 "${systemPromptId}" 不存在，无法检查工具权限`);
      }

      if (preset.mode !== "tool_specific") {
        // 从后端获取通用模式的工具权限配置
        const generalModeConfig = await invoke<{allowAllTools: boolean}>("get_general_mode_config");
        if (!generalModeConfig.allowAllTools) {
          throw new Error("通用模式的工具权限配置必须从后端获取，前端不提供默认权限");
        }
        return true;
      }

      if (!preset.allowedTools) {
        throw new Error(`工具专用模式的允许工具列表未配置，系统提示词 "${systemPromptId}" 缺少必要配置`);
      }

      return preset.allowedTools.includes(toolName);
    } catch (error) {
      console.error("Failed to check tool permission:", error);
      throw new Error(`检查工具 "${toolName}" 权限失败: ${error}`);
    }
  }

  /**
   * Auto add tool prefix
   */
  async autoAddToolPrefix(
    message: string,
    systemPromptId: string
  ): Promise<string> {
    if (!systemPromptId) {
      throw new Error("系统提示词ID必须提供，不能使用默认前缀配置");
    }
    
    if (!message.trim()) {
      return message;
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`系统提示词预设 "${systemPromptId}" 不存在，无法自动添加工具前缀`);
      }

      if (preset.mode === "tool_specific" && preset.autoToolPrefix) {
        // Check if message already contains tool prefix
        if (!message.startsWith("/")) {
          return `${preset.autoToolPrefix} ${message}`;
        }
      }
      return message;
    } catch (error) {
      console.error("Failed to auto add tool prefix:", error);
      throw new Error(`自动添加工具前缀失败: ${error}`);
    }
  }

  /**
   * Validate tool call compliance
   */
  async validateToolCall(
    toolCall: ToolCallRequest,
    systemPromptId: string
  ): Promise<ValidationResult> {
    const isAllowed = await this.checkToolPermission(
      toolCall.tool_name,
      systemPromptId
    );

    return {
      isValid: isAllowed,
      errorMessage: isAllowed
        ? undefined
        : `Current mode does not allow using tool "${toolCall.tool_name}"`,
    };
  }

  /**
   * Validate normal conversation permissions
   */
  async validateConversation(
    content: string,
    systemPromptId: string
  ): Promise<ValidationResult> {
    if (!systemPromptId) {
      throw new Error("系统提示词ID必须提供，不能使用默认对话验证配置");
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`系统提示词预设 "${systemPromptId}" 不存在，无法验证对话权限`);
      }

      if (preset.restrictConversation) {
        // Check if it's a tool call
        const isToolCall = this.parseToolCallFormat(content) !== null;
        if (!isToolCall) {
          return {
            isValid: false,
            errorMessage:
              "当前模式仅支持工具调用，不支持普通对话",
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error("Failed to validate conversation:", error);
      throw new Error(`验证对话权限失败: ${error}`);
    }
  }

  /**
   * Process message and apply auto prefix and permission validation
   */
  async processMessage(
    content: string,
    systemPromptId: string
  ): Promise<{
    processedContent: string;
    validation: ValidationResult;
  }> {
    // 1. Auto add tool prefix (if in tool-specific mode)
    const processedContent = await this.autoAddToolPrefix(
      content,
      systemPromptId
    );

    // 2. Validate normal conversation permissions
    const conversationValidation = await this.validateConversation(
      content,
      systemPromptId
    );
    if (!conversationValidation.isValid) {
      return {
        processedContent,
        validation: conversationValidation,
      };
    }

    // 3. Check tool call permissions (if it's a tool call)
    const toolCall = this.parseToolCallFormat(processedContent);
    if (toolCall) {
      const toolValidation = await this.validateToolCall(
        toolCall,
        systemPromptId
      );
      return {
        processedContent,
        validation: toolValidation,
      };
    }

    return {
      processedContent,
      validation: { isValid: true },
    };
  }

  /**
   * 获取工具类别权重 (用于排序)
   */
  async getCategoryWeight(categoryId: string): Promise<number> {
    try {
      // 使用现有的get_enabled_categories_with_priority命令
      const categories = await invoke<any[]>('get_enabled_categories_with_priority');
      
      // 根据类别在数组中的位置计算权重
      // 数组已经按优先级排序，所以索引就是权重
      const categoryIndex = categories.findIndex(cat => cat.id === categoryId);
      
      if (categoryIndex === -1) {
        throw new Error(`工具类别 "${categoryId}" 的排序权重未配置。请检查后端是否已注册该类别。`);
      }
      
      return categoryIndex + 1; // 权重从1开始
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`获取工具类别 "${categoryId}" 权重失败: ${errorMessage}`);
    }
  }

  /**
   * 获取工具类别显示信息
   */
  async getCategoryDisplayInfo(categoryId: string): Promise<{
    name: string;
    icon: string;
    description: string;
    color?: string;
  }> {
    try {
      // 使用现有的get_enabled_categories_with_priority命令
      const categories = await invoke<any[]>('get_enabled_categories_with_priority');
      
      // 查找指定类别
      const category = categories.find(cat => cat.id === categoryId);
      
      if (!category) {
        throw new Error(`工具类别 "${categoryId}" 未找到。请检查后端是否已注册该类别。`);
      }
      
      // 返回显示信息
      return {
        name: category.display_name || category.name,
        icon: category.icon || '🔧',
        description: category.description || '',
        color: this.getCategoryColor(categoryId)
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`获取工具类别 "${categoryId}" 显示信息失败: ${errorMessage}`);
    }
  }

  /**
   * 获取类别颜色（基于类别ID的简单映射）
   */
  private getCategoryColor(categoryId: string): string {
    const colorMap: Record<string, string> = {
      'file_operations': '#52c41a',
      'command_execution': '#1890ff',
      'general_assistant': '#722ed1',
      'system_analysis': '#fa8c16',
      'development_tools': '#13c2c2',
    };
    
    return colorMap[categoryId] || '#666666';
  }
}
