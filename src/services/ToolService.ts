import { invoke } from "@tauri-apps/api/core";
import { Message } from "../types/chat";

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
  ai_response_template?: string; // 保持字段名一致，但内容是 custom_prompt
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
  type: string;
}

/**
 * ToolService 处理工具调用的业务逻辑
 * 包括工具调用解析、参数处理、工具执行等
 */
export class ToolService {
  private static instance: ToolService;

  static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  /**
   * 解析工具调用格式 (例如: "/create_file 创建一个测试文件")
   */
  parseToolCallFormat(content: string): ToolCallRequest | null {
    if (content.startsWith('/')) {
      // Handle case where user just typed tool name without description
      const spacePos = content.indexOf(' ');
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
   * 获取可用工具列表
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
   * 使用AI解析工具参数
   */
  async parseToolParameters(
    toolCall: ToolCallRequest,
    tool: ToolUIInfo,
    sendLLMRequest: (messages: Message[]) => Promise<string>
  ): Promise<ParameterValue[]> {
    // 构建参数解析的系统提示
    const systemPrompt = this.buildParameterParsingPrompt(tool, toolCall.user_description);
    
    const messages: Message[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: toolCall.user_description,
      }
    ];

    // 调用LLM解析参数
    const aiResponse = await sendLLMRequest(messages);
    
    // 解析AI返回的参数
    return this.parseAIParameterResponse(aiResponse, tool, toolCall.user_description);
  }

  /**
   * 执行工具
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
   * 构建参数解析的系统提示
   */
  private buildParameterParsingPrompt(tool: ToolUIInfo, userDescription: string): string {
    const parametersDesc = tool.parameters
      .map(p => `- ${p.name}: ${p.description} (${p.required ? 'required' : 'optional'})`)
      .join('\n');

    return `You are a parameter parser for tool execution. Based on the user's description, extract the required parameters for the tool and return ONLY the parameter values in the exact format needed.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

For execute_command tool, return only the shell command.
For create_file tool, return the file path and content separated by '|||'.
For read_file/delete_file tools, return only the file path.

User request: ${userDescription}

Respond with only the parameter value(s), no explanation:`;
  }

  /**
   * 解析AI返回的参数响应
   */
  private parseAIParameterResponse(
    aiResponse: string,
    tool: ToolUIInfo,
    userDescription: string
  ): ParameterValue[] {
    const trimmedResponse = aiResponse.trim();
    
    if (!trimmedResponse) {
      throw new Error("AI returned empty parameters");
    }

    const parameters: ParameterValue[] = [];

    // 根据工具类型解析参数
    switch (tool.name) {
      case "execute_command":
        parameters.push({
          name: "command",
          value: trimmedResponse,
        });
        break;

      case "create_file":
        if (trimmedResponse.includes("|||")) {
          const parts = trimmedResponse.split("|||");
          if (parts.length >= 2) {
            parameters.push(
              { name: "path", value: parts[0].trim() },
              { name: "content", value: parts[1].trim() }
            );
          }
        } else {
          // Fallback: use original description
          parameters.push(
            { name: "path", value: "test.txt" },
            { name: "content", value: userDescription }
          );
        }
        break;

      case "read_file":
      case "delete_file":
        parameters.push({
          name: "path",
          value: trimmedResponse,
        });
        break;

      default:
        // Default: use AI-parsed parameters for the first parameter
        if (tool.parameters.length > 0) {
          parameters.push({
            name: tool.parameters[0].name,
            value: trimmedResponse,
          });
        }
        break;
    }

    return parameters;
  }

  /**
   * 格式化工具执行结果
   */
  formatToolResult(toolName: string, parameters: ParameterValue[], result: string): string {
    const paramStr = parameters
      .map(p => `${p.name}: ${p.value}`)
      .join(', ');

    return `**Tool: ${toolName}**

**Parameters:** ${paramStr}

**Result:**
\`\`\`
${result}
\`\`\``;
  }

  /**
   * 检查工具是否存在
   */
  async toolExists(toolName: string): Promise<boolean> {
    try {
      const tools = await this.getAvailableTools();
      return tools.some(tool => tool.name === toolName);
    } catch (error) {
      console.error("Failed to check tool existence:", error);
      return false;
    }
  }

  /**
   * 获取工具信息
   */
  async getToolInfo(toolName: string): Promise<ToolUIInfo | null> {
    try {
      const tools = await this.getAvailableTools();
      return tools.find(tool => tool.name === toolName) || null;
    } catch (error) {
      console.error("Failed to get tool info:", error);
      return null;
    }
  }
}
