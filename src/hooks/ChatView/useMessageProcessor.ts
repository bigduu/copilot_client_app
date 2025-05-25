import { useState, useCallback, useEffect } from "react";
import { ToolCall, ToolInfo } from "../../utils/toolParser";
import { ToolExecutionResult } from "./useToolExecution";
import { Message } from "../../types/chat";
import { messageProcessor, ProcessedMessageFlow } from "../../services/MessageProcessor";

export interface MessageProcessorState {
  initialized: boolean;
  loading: boolean;
  availableTools: ToolInfo[];
  pendingApprovals: ToolCall[];
  lastExecutionResults: ToolExecutionResult[];
}

export interface UseMessageProcessorReturn extends MessageProcessorState {
  // 初始化
  initialize: () => Promise<void>;

  // 核心消息处理
  processMessageFlow: (
    userMessage: string,
    existingMessages: Message[]
  ) => Promise<ProcessedMessageFlow>;

  // 工具执行
  executeApprovedTools: (
    toolCalls: ToolCall[]
  ) => Promise<ToolExecutionResult[]>;
  rejectTools: (toolCalls: ToolCall[]) => void;

  // 状态管理
  clearResults: () => void;
  clearPendingApprovals: () => void;
}

/**
 * useMessageProcessor - MessageProcessor的React Hook封装
 * 提供状态管理和React组件友好的接口
 */
export const useMessageProcessor = (): UseMessageProcessorReturn => {
  const [state, setState] = useState<MessageProcessorState>({
    initialized: false,
    loading: false,
    availableTools: [],
    pendingApprovals: [],
    lastExecutionResults: [],
  });

  /**
   * 初始化MessageProcessor
   */
  const initialize = useCallback(async () => {
    if (state.initialized || state.loading) return;

    setState((prev) => ({ ...prev, loading: true }));

    try {
      await messageProcessor.initialize();
      const tools = messageProcessor.getAvailableTools();

      setState((prev) => ({
        ...prev,
        initialized: true,
        loading: false,
        availableTools: tools,
      }));

      console.log(
        "[useMessageProcessor] MessageProcessor initialized successfully"
      );
    } catch (error) {
      console.error(
        "[useMessageProcessor] Failed to initialize MessageProcessor:",
        error
      );
      setState((prev) => ({
        ...prev,
        loading: false,
        initialized: false,
      }));
    }
  }, [state.initialized, state.loading]);

  /**
   * 处理完整的消息流程
   */
  const processMessageFlow = useCallback(
    async (
      userMessage: string,
      existingMessages: Message[]
    ): Promise<ProcessedMessageFlow> => {
      // 确保已初始化
      if (!state.initialized) {
        await initialize();
      }

      const flow = await messageProcessor.processMessageFlow(
        userMessage,
        existingMessages
      );

      // 包装onResponseComplete来更新状态
      const originalOnResponseComplete = flow.onResponseComplete;
      flow.onResponseComplete = async (aiResponse: string) => {
        const results = await originalOnResponseComplete(aiResponse);

        // 更新执行结果
        setState((prev) => ({
          ...prev,
          lastExecutionResults: results,
        }));

        return results;
      };

      return flow;
    },
    [state.initialized, initialize]
  );

  /**
   * 执行已批准的工具
   */
  const executeApprovedTools = useCallback(
    async (toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> => {
      console.log(
        `[useMessageProcessor] Executing ${toolCalls.length} approved tools:`,
        toolCalls
      );

      try {
        const results = await messageProcessor.executeApprovedTools(toolCalls);
        console.log(`[useMessageProcessor] Tool execution results:`, results);

        // 从待审批列表中移除已执行的工具
        setState((prev) => ({
          ...prev,
          pendingApprovals: prev.pendingApprovals.filter(
            (pending) =>
              !toolCalls.some(
                (executed) => executed.tool_name === pending.tool_name
              )
          ),
          lastExecutionResults: [...prev.lastExecutionResults, ...results],
        }));

        return results;
      } catch (error) {
        console.error(
          `[useMessageProcessor] Error executing approved tools:`,
          error
        );
        throw error;
      }
    },
    []
  );

  /**
   * 拒绝工具执行
   */
  const rejectTools = useCallback((toolCalls: ToolCall[]) => {
    console.log(`[useMessageProcessor] Rejecting ${toolCalls.length} tools`);

    setState((prev) => ({
      ...prev,
      pendingApprovals: prev.pendingApprovals.filter(
        (pending) =>
          !toolCalls.some(
            (rejected) => rejected.tool_name === pending.tool_name
          )
      ),
    }));
  }, []);

  /**
   * 清除执行结果
   */
  const clearResults = useCallback(() => {
    setState((prev) => ({
      ...prev,
      lastExecutionResults: [],
    }));
  }, []);

  /**
   * 清除待审批工具
   */
  const clearPendingApprovals = useCallback(() => {
    setState((prev) => ({
      ...prev,
      pendingApprovals: [],
    }));
  }, []);

  /**
   * 监听工具待审批事件
   */
  useEffect(() => {
    const handlePendingApprovals = (event: CustomEvent) => {
      const { toolCalls } = event.detail;
      console.log(
        `[useMessageProcessor] Received ${toolCalls.length} tools pending approval`
      );

      setState((prev) => ({
        ...prev,
        pendingApprovals: [...prev.pendingApprovals, ...toolCalls],
      }));
    };

    // 类型断言来处理CustomEvent
    const typedHandler = handlePendingApprovals as EventListener;
    window.addEventListener("tools-pending-approval", typedHandler);

    return () => {
      window.removeEventListener("tools-pending-approval", typedHandler);
    };
  }, []);

  /**
   * 组件挂载时自动初始化
   */
  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    ...state,
    initialize,
    processMessageFlow,
    executeApprovedTools,
    rejectTools,
    clearResults,
    clearPendingApprovals,
  };
};

export default useMessageProcessor;
