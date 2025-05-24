import { Message } from "../types/chat";
import { toolParser, ToolCall, ToolInfo } from "../utils/toolParser";
import { invoke } from "@tauri-apps/api/core";
import { SystemPromptService } from "./SystemPromptService";

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  toolName: string;
}

export interface ProcessedMessageFlow {
  preprocessedMessages: Message[];
  onResponseComplete: (aiResponse: string) => Promise<ToolExecutionResult[]>;
}

/**
 * MessageProcessor - 前端消息处理器
 * 负责消息的预处理（增强系统提示）和后处理（工具调用解析和执行）
 */
export class MessageProcessor {
  private initialized = false;
  private availableTools: ToolInfo[] = [];

  /**
   * 初始化工具列表
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log("[MessageProcessor] Initializing tools...");
      await toolParser.loadAvailableTools();
      this.availableTools = toolParser.getAvailableTools();
      this.initialized = true;
      console.log(
        `[MessageProcessor] Loaded ${this.availableTools.length} tools`
      );
    } catch (error) {
      console.error("[MessageProcessor] Failed to initialize tools:", error);
      this.availableTools = [];
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 预处理消息：增强系统提示，添加工具信息
   */
  async preprocessMessages(messages: Message[]): Promise<Message[]> {
    await this.ensureInitialized();

    if (this.availableTools.length === 0) {
      console.warn(
        "[MessageProcessor] No tools available, skipping enhancement"
      );
      return messages;
    }

    console.log(
      "[MessageProcessor] Enhancing system prompt with tool information"
    );

    // 获取当前系统提示
    const systemPromptService = SystemPromptService.getInstance();

    // 检查消息数组中是否已有系统消息
    const systemMessageIndex = messages.findIndex(
      (msg) => msg.role === "system"
    );
    let systemPrompt: string;

    if (systemMessageIndex >= 0) {
      // 优先使用消息数组中的系统消息
      systemPrompt = messages[systemMessageIndex].content;
      console.log("[MessageProcessor] Using system prompt from messages array");
    } else {
      // 如果消息数组中没有系统消息，则使用全局系统提示
      systemPrompt = systemPromptService.getGlobalSystemPrompt();
      console.log("[MessageProcessor] Using global system prompt");
    }

    console.log(
      "[MessageProcessor] System prompt preview:",
      systemPrompt.substring(0, 50) + "..."
    );

    // 使用toolParser的增强系统消息功能，传入系统提示
    const enhancedMessages = toolParser.enhanceSystemMessage(
      messages,
      systemPrompt
    );

    console.log(
      "[MessageProcessor] System prompt enhanced, total messages:",
      enhancedMessages.length
    );
    return enhancedMessages;
  }

  /**
   * 从AI回复中解析工具调用
   */
  parseToolCalls(aiResponse: string): ToolCall[] {
    const toolCalls = toolParser.parseToolCallsFromContent(aiResponse);
    console.log(
      `[MessageProcessor] Parsed ${toolCalls.length} tool calls from AI response`
    );
    return toolCalls;
  }

  /**
   * 执行单个工具
   */
  private async executeSingleTool(
    toolCall: ToolCall
  ): Promise<ToolExecutionResult> {
    const parameters = toolParser.convertToolCallToParameters(toolCall);
    const command =
      toolCall.tool_type === "mcp" ? "execute_mcp_tool" : "execute_local_tool";

    console.log(
      `[MessageProcessor] Executing ${toolCall.tool_type} tool: ${toolCall.tool_name}`
    );

    try {
      const result = await invoke<string>(command, {
        toolName: toolCall.tool_name,
        parameters: parameters,
      });

      return {
        success: true,
        result,
        toolName: toolCall.tool_name,
      };
    } catch (error: any) {
      console.error(
        `[MessageProcessor] Tool execution failed for ${toolCall.tool_name}:`,
        error
      );
      return {
        success: false,
        error: error.message || String(error),
        toolName: toolCall.tool_name,
      };
    }
  }

  /**
   * 执行工具调用（分为安全和需要approval的）
   */
  async executeTools(toolCalls: ToolCall[]): Promise<{
    autoExecuted: ToolExecutionResult[];
    pendingApproval: ToolCall[];
  }> {
    if (toolCalls.length === 0) {
      return { autoExecuted: [], pendingApproval: [] };
    }

    // 分类工具调用
    const safeCalls = toolCalls.filter((call) => !call.requires_approval);
    const dangerousCalls = toolCalls.filter((call) => call.requires_approval);

    console.log(
      `[MessageProcessor] Auto-executing ${safeCalls.length} safe tools, ${dangerousCalls.length} require approval`
    );

    // 自动执行安全工具
    const autoExecuted: ToolExecutionResult[] = [];
    for (const toolCall of safeCalls) {
      const result = await this.executeSingleTool(toolCall);
      autoExecuted.push(result);
    }

    return {
      autoExecuted,
      pendingApproval: dangerousCalls,
    };
  }

  /**
   * 批准并执行待审批的工具
   */
  async executeApprovedTools(
    toolCalls: ToolCall[]
  ): Promise<ToolExecutionResult[]> {
    console.log(
      `[MessageProcessor] Executing ${toolCalls.length} approved tools:`,
      JSON.stringify(toolCalls)
    );

    const results: ToolExecutionResult[] = [];
    for (const toolCall of toolCalls) {
      console.log(
        `[MessageProcessor] Executing approved tool: ${toolCall.tool_name} (${toolCall.tool_type})`
      );
      console.log(
        `[MessageProcessor] Tool parameters:`,
        JSON.stringify(toolCall.parameters)
      );

      try {
        const parameters = toolParser.convertToolCallToParameters(toolCall);
        console.log(
          `[MessageProcessor] Converted parameters:`,
          JSON.stringify(parameters)
        );

        const result = await this.executeSingleTool(toolCall);
        console.log(
          `[MessageProcessor] Tool execution result:`,
          JSON.stringify(result)
        );
        results.push(result);
      } catch (error) {
        console.error(
          `[MessageProcessor] Error executing tool ${toolCall.tool_name}:`,
          error
        );
        // Still add the error result
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          toolName: toolCall.tool_name,
        });
      }
    }

    console.log(
      `[MessageProcessor] All approved tools executed, results:`,
      JSON.stringify(results)
    );
    return results;
  }

  /**
   * 处理完整的消息流程
   */
  async processMessageFlow(
    userMessage: string,
    existingMessages: Message[]
  ): Promise<ProcessedMessageFlow> {
    await this.ensureInitialized();

    // 构建包含用户消息的完整消息列表
    const userMsg: Message = {
      role: "user",
      content: userMessage,
      id: crypto.randomUUID(),
    };

    // 检查现有消息中是否已有系统消息
    const hasSystemMessage = existingMessages.some(
      (msg) => msg.role === "system"
    );
    console.log(
      `[MessageProcessor] Existing messages has system message: ${hasSystemMessage}`
    );

    const allMessages = [...existingMessages, userMsg];

    // 预处理：增强系统提示
    const preprocessedMessages = await this.preprocessMessages(allMessages);

    // 返回预处理的消息和后处理回调
    const onResponseComplete = async (
      aiResponse: string
    ): Promise<ToolExecutionResult[]> => {
      console.log("[MessageProcessor] Processing AI response for tool calls");

      // 解析工具调用
      const toolCalls = this.parseToolCalls(aiResponse);

      if (toolCalls.length === 0) {
        console.log("[MessageProcessor] No tool calls found in AI response");
        return [];
      }

      // 执行工具
      const { autoExecuted, pendingApproval } = await this.executeTools(
        toolCalls
      );

      // 现在只返回自动执行的结果，待审批的需要通过其他机制处理
      if (pendingApproval.length > 0) {
        console.log(
          `[MessageProcessor] ${pendingApproval.length} tools require user approval`
        );
        // 这里可以触发事件或者通过状态管理来通知UI显示approval界面
        this.notifyPendingApprovals(pendingApproval);
      }

      return autoExecuted;
    };

    return {
      preprocessedMessages,
      onResponseComplete,
    };
  }

  /**
   * 通知有待审批的工具（可以通过事件或状态管理）
   */
  private notifyPendingApprovals(pendingApprovals: ToolCall[]): void {
    // 发送自定义事件，让UI组件监听
    const event = new CustomEvent("tools-pending-approval", {
      detail: { toolCalls: pendingApprovals },
    });
    window.dispatchEvent(event);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): ToolInfo[] {
    return this.availableTools;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

// 导出单例
export const messageProcessor = new MessageProcessor();
