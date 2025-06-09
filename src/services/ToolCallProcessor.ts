import { Message } from "../types/chat";
import {
  ToolService,
  ToolCallRequest,
  ParameterValue,
  ToolUIInfo,
} from "./ToolService";

export enum ToolType {
  AIParameterParsing = "AIParameterParsing",
  RegexParameterExtraction = "RegexParameterExtraction",
}

export interface ToolCallResult {
  success: boolean;
  content: string;
  toolName: string;
  parameters: ParameterValue[];
}

export interface ProcessorUpdate {
  type: "processor_update";
  source: string;
  content: string;
}

/**
 * 独立的工具调用处理器
 * 负责处理不同类型的工具调用流程
 */
export class ToolCallProcessor {
  private static instance: ToolCallProcessor;
  private toolService: ToolService;

  constructor() {
    this.toolService = ToolService.getInstance();
  }

  static getInstance(): ToolCallProcessor {
    if (!ToolCallProcessor.instance) {
      ToolCallProcessor.instance = new ToolCallProcessor();
    }
    return ToolCallProcessor.instance;
  }

  /**
   * 检查消息是否为工具调用
   */
  isToolCall(content: string): boolean {
    return content.startsWith("/");
  }

  /**
   * 解析工具调用
   */
  parseToolCall(content: string): ToolCallRequest | null {
    return this.toolService.parseToolCallFormat(content);
  }

  /**
   * 执行工具并获取结果 - 用于regex类型工具
   */
  async executeToolAndGetResult(
    toolCall: ToolCallRequest,
    onUpdate?: (update: ProcessorUpdate) => void
  ): Promise<{
    success: boolean;
    toolResult: string;
    toolInfo: ToolUIInfo;
    parameters: ParameterValue[];
    error?: string;
  }> {
    try {
      // 发送处理更新
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Processing tool call: /${toolCall.tool_name} ${toolCall.user_description}`,
      });

      // 1. 检查工具是否存在
      const toolInfo = await this.toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        return {
          success: false,
          toolResult: "",
          toolInfo: {} as ToolUIInfo,
          parameters: [],
          error: `Tool '${toolCall.tool_name}' not found. Available tools: ${await this.getAvailableToolNames()}`,
        };
      }

      // 2. 提取参数（只支持regex工具）
      if (!this.isRegexTool(toolInfo)) {
        return {
          success: false,
          toolResult: "",
          toolInfo,
          parameters: [],
          error: "This method only supports regex parameter extraction tools",
        };
      }

      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Extracting parameters using regex for tool: ${toolCall.tool_name}`,
      });

      const parameters = await this.extractParametersWithRegex(toolCall, toolInfo);

      // 3. 执行工具
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Executing tool: ${toolCall.tool_name}`,
      });

      const toolResult = await this.toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      return {
        success: true,
        toolResult,
        toolInfo,
        parameters,
      };
    } catch (error) {
      console.error("Tool execution failed:", error);
      return {
        success: false,
        toolResult: "",
        toolInfo: {} as ToolUIInfo,
        parameters: [],
        error: `Tool execution failed: ${error}`,
      };
    }
  }

  /**
   * 构建AI响应消息 - 基于工具执行结果
   */
  buildAIResponseMessage(
    toolInfo: ToolUIInfo,
    toolCall: ToolCallRequest,
    toolResult: string
  ): string {
    // 构建用户消息，包含工具执行结果和自定义提示
    let userMessage = `Based on the tool execution result, please provide a helpful summary and explanation for: "${toolCall.user_description}"

Tool execution result:
${toolResult}`;

    // 如果工具提供了自定义AI响应模板，添加到消息中
    if (toolInfo.ai_response_template) {
      userMessage += `\n\nAdditional instructions: ${toolInfo.ai_response_template}`;
    }

    userMessage += "\n\nDo not include any tool calls (starting with '/') in your response.";

    return userMessage;
  }

  /**
   * 处理工具调用的主要入口点 - 非流式版本（保持向后兼容）
   */
  async processToolCall(
    toolCall: ToolCallRequest,
    onUpdate?: (update: ProcessorUpdate) => void,
    sendLLMRequest?: (messages: Message[]) => Promise<string>
  ): Promise<ToolCallResult> {
    try {
      // 发送处理更新
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Processing tool call: /${toolCall.tool_name} ${toolCall.user_description}`,
      });

      // 1. 检查工具是否存在
      const toolInfo = await this.toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        return {
          success: false,
          content: `Tool '${
            toolCall.tool_name
          }' not found. Available tools: ${await this.getAvailableToolNames()}`,
          toolName: toolCall.tool_name,
          parameters: [],
        };
      }

      // 2. 根据工具类型处理参数
      let parameters: ParameterValue[];

      if (this.isRegexTool(toolInfo)) {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Extracting parameters using regex for tool: ${toolCall.tool_name}`,
        });
        parameters = await this.extractParametersWithRegex(toolCall, toolInfo);
      } else {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Analyzing parameters with AI for tool: ${toolCall.tool_name}`,
        });

        if (!sendLLMRequest) {
          throw new Error(
            "AI parameter parsing requires sendLLMRequest function"
          );
        }

        parameters = await this.toolService.parseToolParameters(
          toolCall,
          toolInfo,
          sendLLMRequest
        );
      }

      // 3. 执行工具
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Executing tool: ${toolCall.tool_name}`,
      });

      const result = await this.toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      // 4. 处理结果
      // 对于正则工具，使用AI对结果进行总结
      // 对于AI参数解析工具，直接格式化结果
      if (this.isRegexTool(toolInfo) && sendLLMRequest) {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Generating AI summary for regex tool: ${toolCall.tool_name}`,
        });

        try {
          // 构建提示，使用工具提供的模板或默认模板
          const systemPrompt = this.buildAIResponsePrompt(
            toolInfo,
            toolCall,
            parameters,
            result
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

          // 调用LLM生成最终响应
          const aiResponse = await sendLLMRequest(messages);

          return {
            success: true,
            content: aiResponse,
            toolName: toolCall.tool_name,
            parameters,
          };
        } catch (aiError) {
          console.error(
            "AI response generation failed for regex tool:",
            aiError
          );
          // 降级到格式化结果
          const formattedResult = this.toolService.formatToolResult(
            toolCall.tool_name,
            parameters,
            result
          );

          return {
            success: true,
            content: formattedResult,
            toolName: toolCall.tool_name,
            parameters,
          };
        }
      } else {
        // 对于AI参数解析工具，直接格式化结果（不需要AI总结）
        const formattedResult = this.toolService.formatToolResult(
          toolCall.tool_name,
          parameters,
          result
        );

        return {
          success: true,
          content: formattedResult,
          toolName: toolCall.tool_name,
          parameters,
        };
      }
    } catch (error) {
      console.error("Tool call processing failed:", error);
      return {
        success: false,
        content: `Tool execution failed: ${error}`,
        toolName: toolCall.tool_name,
        parameters: [],
      };
    }
  }

  /**
   * 检查工具是否为正则提取类型
   */
  private isRegexTool(toolInfo: ToolUIInfo): boolean {
    return toolInfo.tool_type === "RegexParameterExtraction";
  }

  /**
   * 构建AI响应提示，基础格式 + 工具自定义提示
   */
  private buildAIResponsePrompt(
    toolInfo: ToolUIInfo,
    toolCall: ToolCallRequest,
    parameters: ParameterValue[],
    result: string
  ): string {
    // 基础格式（固定）
    const basePrompt = `You are a helpful assistant. I executed the ${
      toolCall.tool_name
    } tool with the following parameters: ${parameters
      .map((p) => `${p.name}: ${p.value}`)
      .join(", ")}.

Result:
${result}

Based on the original request "${
      toolCall.user_description
    }" and the tool execution result above, please provide a helpful summary and explanation.`;

    // 如果工具提供了自定义提示，追加到基础格式后面
    if (toolInfo.ai_response_template) {
      return `${basePrompt}

${toolInfo.ai_response_template}

Do not include any tool calls (starting with '/') in your response.`;
    }

    // 否则使用默认结尾
    return `${basePrompt} Do not include any tool calls (starting with '/') in your response.`;
  }

  /**
   * 使用正则表达式提取参数
   */
  private async extractParametersWithRegex(
    toolCall: ToolCallRequest,
    toolInfo: ToolUIInfo
  ): Promise<ParameterValue[]> {
    const fullCommand = `/${toolCall.tool_name} ${toolCall.user_description}`;

    // 使用工具定义的正则表达式，或者使用默认的
    let regex: RegExp;

    if (toolInfo.parameter_regex) {
      regex = new RegExp(toolInfo.parameter_regex);
    } else {
      // 默认正则：提取工具名后的所有内容
      regex = new RegExp(`^\\/${toolInfo.name}\\s+(.+)$`);
    }

    const match = fullCommand.match(regex);
    if (!match) {
      throw new Error(`Failed to extract parameters from: ${fullCommand}`);
    }

    // 根据工具的参数定义返回参数值
    const parameters: ParameterValue[] = [];

    if (toolInfo.parameters.length > 0) {
      // 将匹配的内容分配给第一个参数
      parameters.push({
        name: toolInfo.parameters[0].name,
        value: match[1].trim(),
      });
    }

    return parameters;
  }

  /**
   * 获取可用工具名称列表
   */
  private async getAvailableToolNames(): Promise<string> {
    try {
      const tools = await this.toolService.getAvailableTools();
      return tools.map((tool) => tool.name).join(", ");
    } catch (error) {
      return "Unable to fetch available tools";
    }
  }



  /**
   * 获取工具类型信息（从后端）
   */
  async getToolTypeInfo(toolName: string): Promise<ToolType | null> {
    try {
      const toolInfo = await this.toolService.getToolInfo(toolName);
      if (!toolInfo) {
        return null;
      }

      return toolInfo.tool_type === "RegexParameterExtraction"
        ? ToolType.RegexParameterExtraction
        : ToolType.AIParameterParsing;
    } catch (error) {
      console.error("Failed to get tool type info:", error);
      return null;
    }
  }

  /**
   * 验证工具调用格式
   */
  validateToolCall(content: string): { valid: boolean; error?: string } {
    if (!content.startsWith("/")) {
      return { valid: false, error: "Tool call must start with '/'" };
    }

    const parts = content.slice(1).split(" ");
    if (parts.length === 0 || parts[0].trim() === "") {
      return { valid: false, error: "Tool name is required" };
    }

    return { valid: true };
  }
}
