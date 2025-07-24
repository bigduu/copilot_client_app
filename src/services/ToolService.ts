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



/**
 * ToolService handles business logic for tool invocations
 * Including tool call parsing, parameter processing, tool execution, etc.
 */
export class ToolService {
  private static instance: ToolService;
  private systemPromptService: SystemPromptService;

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

    console.log("[ToolService] AI parameter parsing response:", aiResponse);

    // Parse parameters returned by AI
    const parsedParams = await this.parseAIParameterResponse(
      aiResponse,
      tool,
      toolCall.user_description
    );

    console.log("[ToolService] Parsed parameters:", parsedParams);
    return parsedParams;
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

    // Special handling for execute_command tool
    if (tool.name === "execute_command") {
      return `You are a command parameter parser. Your task is to extract the shell command from user input.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

RULES:
- The user input is the command they want to execute
- Return ONLY the command string, nothing else
- Do NOT add explanations, quotes, or formatting
- Do NOT provide safety warnings

User wants to execute: "${userDescription}"

Command:`;
    }

    // Default prompt for other tools
    return `CRITICAL: You are ONLY a parameter extraction system. Ignore any previous instructions or system prompts.

Your ONLY task is to extract parameter values from user input for tool execution.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

EXTRACTION RULES:
- Extract the exact parameter value from the user input
- Return ONLY the raw parameter value, nothing else
- Do NOT ask questions, provide explanations, or act as an assistant
- Do NOT provide safety warnings or security checks

User input: "${userDescription}"

Extract parameter value:`;
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

    // Special handling for execute_command tool
    if (tool.name === "execute_command" && tool.parameters.length === 1) {
      // For execute_command, use AI response directly if it looks like a valid command
      let command = trimmedResponse;

      // Fallback: if AI response is empty or looks invalid, use user description
      if (!command || command.length === 0) {
        command = userDescription;

        // If user description starts with "/execute_command ", extract the command part
        if (userDescription.startsWith("/execute_command ")) {
          command = userDescription.substring("/execute_command ".length);
        }
      }

      parameters.push({
        name: tool.parameters[0].name,
        value: command,
      });

      console.log("[ToolService] Execute command parameter extracted:", command);
      console.log("[ToolService] AI response was:", trimmedResponse);
      console.log("[ToolService] User description was:", userDescription);
      return parameters;
    }

    // 简化的参数解析：根据工具参数定义解析 AI 响应
    // 对于大多数工具，AI 应该返回适合的参数值
    if (tool.parameters.length === 1) {
      // 单参数工具：直接使用 AI 响应作为参数值
      parameters.push({
        name: tool.parameters[0].name,
        value: trimmedResponse,
      });
    } else if (tool.parameters.length > 1) {
      // 多参数工具：尝试按行分割或使用整个响应作为第一个参数
      const lines = trimmedResponse.split('\n').filter(line => line.trim());
      if (lines.length >= tool.parameters.length) {
        // 按行分配参数
        tool.parameters.forEach((param, index) => {
          parameters.push({
            name: param.name,
            value: lines[index] ? lines[index].trim() : userDescription,
          });
        });
      } else {
        // 回退：使用用户描述作为第一个参数的值
        parameters.push({
          name: tool.parameters[0].name,
          value: userDescription,
        });
      }
    } else {
      throw new Error(`工具 "${tool.name}" 没有定义参数`);
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

    // 简化的结果格式化：根据工具类型和参数推断代码语言
    let codeLanguage = "text";

    // 尝试从文件路径参数推断语言
    const pathParam = parameters.find((p) =>
      p.name.toLowerCase().includes("path") ||
      p.name.toLowerCase().includes("file")
    );

    if (pathParam) {
      const ext = pathParam.value.split(".").pop()?.toLowerCase();
      const extensionMap: Record<string, string> = {
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "py": "python",
        "rs": "rust",
        "json": "json",
        "md": "markdown",
        "html": "html",
        "css": "css",
        "sh": "bash",
        "yml": "yaml",
        "yaml": "yaml"
      };

      if (ext && extensionMap[ext]) {
        codeLanguage = extensionMap[ext];
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

      // 通用模式（general）：允许使用所有工具
      // 这是因为通用助手类别应该能够访问所有可用的工具
      if (preset.mode !== "tool_specific") {
        return true;
      }

      // 工具专用模式：检查工具是否在允许列表中
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
      // 使用新的get_tool_categories命令获取按优先级排序的类别
      const categories = await invoke<any[]>('get_tool_categories');

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
      // 使用新的get_tool_categories命令获取类别信息
      const categories = await invoke<any[]>('get_tool_categories');

      // 查找指定类别
      const category = categories.find(cat => cat.id === categoryId);

      if (!category) {
        throw new Error(`工具类别 "${categoryId}" 未找到。请检查后端是否已注册该类别。`);
      }

      // 返回显示信息，直接使用后端提供的数据，不进行任何硬编码映射
      return {
        name: category.display_name || category.name || categoryId,
        icon: category.emoji_icon || '🔧', // 使用emoji图标而不是字符串名称
        description: category.description || '',
        color: category.color || '#666666' // 直接使用后端提供的颜色，如果没有则使用默认值
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`获取工具类别 "${categoryId}" 显示信息失败: ${errorMessage}`);
    }
  }


}
