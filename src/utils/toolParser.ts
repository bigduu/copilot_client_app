import { invoke } from "@tauri-apps/api/core";

export interface ToolInfo {
  name: string;
  type: "local" | "mcp";
  description: string;
  parameters: ParameterInfo[];
  requires_approval: boolean;
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
}

export interface ToolCall {
  tool_type: "local" | "mcp";
  tool_name: string;
  parameters: Record<string, any>;
  requires_approval: boolean;
}

export interface Parameter {
  name: string;
  description: string;
  required: boolean;
  value: string;
}

export class ToolParser {
  private availableTools: ToolInfo[] = [];

  /**
   * 加载可用工具列表
   */
  async loadAvailableTools(): Promise<void> {
    try {
      const tools: ToolInfo[] = await invoke("get_all_available_tools");
      console.log("[ToolParser] Loaded available tools:", tools);
      this.availableTools = tools;
      console.log("[ToolParser] Available tools:", this.availableTools);
    } catch (error) {
      console.error("Failed to load available tools:", error);
      this.availableTools = [];
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): ToolInfo[] {
    return this.availableTools;
  }

  /**
   * 生成包含工具信息的系统提示
   */
  generateSystemPrompt(): string {
    const localTools = this.availableTools.filter((t) => t.type === "local");
    const mcpTools = this.availableTools.filter((t) => t.type === "mcp");

    let prompt = `=== Available Tools ===\n\n`;

    if (localTools.length > 0) {
      prompt += `**Local Tools:**\n`;
      localTools.forEach((tool) => {
        prompt += `- ${tool.name}: ${tool.description}\n`;

        if (tool.parameters.length > 0) {
          prompt += `  Parameters:\n`;
          tool.parameters.forEach((param) => {
            prompt += `  - ${param.name}: ${param.description} ${
              param.required ? "(required)" : "(optional)"
            }\n`;
          });
        }
      });
      prompt += `\n`;
    }

    if (mcpTools.length > 0) {
      prompt += `**MCP Tools:**\n`;
      mcpTools.forEach((tool) => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      });
      prompt += `\n`;
    }

    prompt += `Usage: When using tools, please include JSON format in your response:\n`;
    prompt += `{"use_tool": true, "tool_type": "local|mcp", "tool_name": "tool name", "parameters": {...}, "requires_approval": true/false}\n\n`;
    prompt += `Safe operations (query, search): requires_approval: false\n`;
    prompt += `Dangerous operations (create, delete, modify): requires_approval: true\n\n`;
    prompt += `Important: When calling a tool, return ONLY the JSON object with no additional text before or after. Any extra text will interfere with result parsing.`;

    return prompt;
  }

  /**
   * 从AI回复内容中解析工具调用
   */
  parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // 记录解析过程
    console.log(
      "[ToolParser] Parsing content for tool calls, content length:",
      content.length
    );

    // 尝试处理整个内容是一个完整的JSON对象的情况
    if (content.trim().startsWith("{") && content.trim().endsWith("}")) {
      try {
        const parsed = JSON.parse(content.trim());
        console.log(
          "[ToolParser] Successfully parsed entire content as JSON:",
          parsed
        );

        if (parsed.use_tool === true && parsed.tool_name) {
          // 重要：保留原始的requires_approval值，不要覆盖它
          let requiresApproval = parsed.requires_approval;

          // 只有当requires_approval未明确指定时，才应用默认规则
          if (typeof requiresApproval !== "boolean") {
            requiresApproval = this.shouldRequireApproval(parsed.tool_name);
          } else {
            console.log(
              `[ToolParser] Using explicit requires_approval=${requiresApproval} for tool ${parsed.tool_name}`
            );
          }

          const toolCall: ToolCall = {
            tool_type: parsed.tool_type || "local",
            tool_name: parsed.tool_name,
            parameters: parsed.parameters || {},
            requires_approval: requiresApproval,
          };

          console.log(
            "[ToolParser] Found valid tool call in content:",
            toolCall
          );
          toolCalls.push(toolCall);
          return toolCalls;
        }
      } catch (error) {
        console.log(
          "[ToolParser] Content is not a complete JSON object:",
          error
        );
        // 如果整个内容不是JSON，继续尝试其他方法
      }
    }

    // 查找JSON格式的工具调用 - 处理混合内容中的JSON
    const jsonPattern =
      /\{(?:[^{}]|\{[^{}]*\})*"use_tool"\s*:\s*true(?:[^{}]|\{[^{}]*\})*\}/g;
    const matches = content.match(jsonPattern);

    console.log("[ToolParser] JSON pattern matches:", matches?.length || 0);

    if (!matches) return toolCalls;

    for (const match of matches) {
      console.log("[ToolParser] Processing match:", match);
      try {
        const parsed = JSON.parse(match);

        if (parsed.use_tool === true && parsed.tool_name) {
          // 同样处理这里的requires_approval
          let requiresApproval = parsed.requires_approval;

          if (typeof requiresApproval !== "boolean") {
            requiresApproval = this.shouldRequireApproval(parsed.tool_name);
          } else {
            console.log(
              `[ToolParser] Using explicit requires_approval=${requiresApproval} for tool ${parsed.tool_name}`
            );
          }

          const toolCall: ToolCall = {
            tool_type: parsed.tool_type || "local",
            tool_name: parsed.tool_name,
            parameters: parsed.parameters || {},
            requires_approval: requiresApproval,
          };

          console.log("[ToolParser] Created tool call:", toolCall);
          toolCalls.push(toolCall);
        }
      } catch (error) {
        console.warn(
          "[ToolParser] Failed to parse tool call JSON:",
          match,
          error
        );
      }
    }

    console.log("[ToolParser] Total tool calls found:", toolCalls.length);
    return toolCalls;
  }

  /**
   * 判断工具是否需要approval
   */
  shouldRequireApproval(toolName: string): boolean {
    // 根据工具信息判断
    const tool = this.availableTools.find((t) => t.name === toolName);
    if (tool) {
      return tool.requires_approval;
    }

    // 默认危险操作
    const dangerousTools = [
      "create_file",
      "update_file",
      "delete_file",
      "append_file",
      "execute_command",
    ];

    return dangerousTools.includes(toolName);
  }

  /**
   * 增强系统消息
   * @param messages 消息数组
   * @param existingSystemPrompt 可选的已存在的系统提示，如果提供则优先使用
   */
  enhanceSystemMessage(messages: any[], existingSystemPrompt?: string): any[] {
    const toolsPrompt = this.generateSystemPrompt();
    const enhancedMessages = [...messages];

    // 详细记录每个消息的结构
    console.log("Messages count:", messages.length);

    // 查找现有的系统消息 - 检查多种可能的系统消息格式
    const systemMessageIndex = enhancedMessages.findIndex(
      (msg) =>
        msg.role === "system" ||
        (typeof msg.content === "object" && msg.content?.role === "system") ||
        msg.type === "system"
    );

    console.log("System message found at index:", systemMessageIndex);

    if (systemMessageIndex >= 0) {
      // 找到现有系统消息，追加工具信息
      const existingMsg = enhancedMessages[systemMessageIndex];

      // 处理不同的系统消息格式
      if (existingMsg.role === "system") {
        enhancedMessages[systemMessageIndex] = {
          ...existingMsg,
          content: `${existingMsg.content}\n\n${toolsPrompt}`,
        };
      } else if (
        typeof existingMsg.content === "object" &&
        existingMsg.content?.role === "system"
      ) {
        enhancedMessages[systemMessageIndex] = {
          ...existingMsg,
          content: {
            ...existingMsg.content,
            content: `${existingMsg.content.content}\n\n${toolsPrompt}`,
          },
        };
      } else if (existingMsg.type === "system") {
        enhancedMessages[systemMessageIndex] = {
          ...existingMsg,
          content: `${existingMsg.content}\n\n${toolsPrompt}`,
        };
      }
    } else {
      // 没有找到系统消息，创建新的系统消息
      console.log("No system message found in messages array");

      // 确定系统提示内容
      let basePrompt: string;
      if (existingSystemPrompt && existingSystemPrompt.trim()) {
        // 使用传入的系统提示
        basePrompt = existingSystemPrompt;
        console.log("Using provided system prompt");
      } else {
        // 使用默认系统提示
        basePrompt = "You are an AI assistant.";
        console.log("Using default system prompt");
      }

      console.log(
        "System prompt preview:",
        basePrompt.substring(0, 50) + "..."
      );

      // 添加到消息数组开头
      enhancedMessages.unshift({
        role: "system",
        content: `${basePrompt}\n\n${toolsPrompt}`,
      });
    }

    console.log("Enhanced messages count:", enhancedMessages.length);
    return enhancedMessages;
  }

  /**
   * 将ToolCall转换为Parameter格式（用于后端API）
   */
  convertToolCallToParameters(toolCall: ToolCall): Parameter[] {
    const parameters: Parameter[] = [];

    for (const [key, value] of Object.entries(toolCall.parameters)) {
      parameters.push({
        name: key,
        description: "", // 执行时不需要description
        required: true, // 执行时不需要required
        value: String(value),
      });
    }

    return parameters;
  }
}

// 导出单例
export const toolParser = new ToolParser();
