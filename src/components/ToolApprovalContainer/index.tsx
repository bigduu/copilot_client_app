import React, { useState, useEffect } from "react";
import { ToolCall } from "../../utils/toolParser";
import ToolApprovalCard from "../ToolApprovalCard";
import "./styles.css";
import { useMessageProcessorContext } from "../../contexts/MessageProcessorContext";
import { useChat } from "../../contexts/ChatContext";
import { ToolExecutionResult } from "../../services/MessageProcessor";

interface ToolApprovalContainerProps {
  // 可以接受额外的props
}

export const ToolApprovalContainer: React.FC<
  ToolApprovalContainerProps
> = () => {
  // 使用messageProcessor context获取待审批工具列表和处理方法
  const {
    pendingApprovals,
    executeApprovedTools,
    rejectTools,
    clearPendingApprovals,
  } = useMessageProcessorContext();

  // 使用chat context来更新消息
  const chatContext = useChat();
  const { currentChatId, currentMessages } = chatContext;
  // 确保updateChatMessages存在
  const updateChatMessages = chatContext.updateChat
    ? (chatId: string, messages: any) => {
        chatContext.updateChat(chatId, { messages });
      }
    : null;

  // 本地状态用于跟踪工具执行状态
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  // 将工具执行结果添加到最近的助手消息中
  const appendToolResultsToMessage = (toolResults: ToolExecutionResult[]) => {
    if (!currentChatId || currentMessages.length === 0 || !updateChatMessages) {
      console.error(
        "[ToolApprovalContainer] Cannot append tool results: No current chat or messages or updateChatMessages function"
      );
      return;
    }

    // 找到最近的助手消息
    const assistantMessageIndex = [...currentMessages]
      .reverse()
      .findIndex((m) => m.role === "assistant");
    if (assistantMessageIndex === -1) {
      console.error(
        "[ToolApprovalContainer] No assistant message found to append tool results"
      );
      return;
    }

    const realIndex = currentMessages.length - 1 - assistantMessageIndex;
    const updatedMessages = [...currentMessages];

    // 创建包含工具执行结果的格式化文本
    const toolResultsText = toolResults
      .map((result: ToolExecutionResult) => {
        return result.success
          ? `\n\n**工具执行结果 (${result.toolName}):**\n\`\`\`\n${result.result}\n\`\`\``
          : `\n\n**工具执行失败 (${result.toolName}):**\n\`\`\`\n${result.error}\n\`\`\``;
      })
      .join("\n");

    // 更新助手消息内容，添加工具执行结果
    updatedMessages[realIndex] = {
      ...updatedMessages[realIndex],
      content: updatedMessages[realIndex].content + toolResultsText,
      processorUpdates: [
        ...(updatedMessages[realIndex].processorUpdates || []),
        ...toolResults.map(
          (r: ToolExecutionResult) =>
            `工具执行${r.success ? "成功" : "失败"}: ${r.toolName}`
        ),
      ],
    };

    console.log(
      "[ToolApprovalContainer] Updating message with tool results:",
      toolResultsText
    );
    updateChatMessages(currentChatId, updatedMessages);
  };

  // 批准工具
  const handleApprove = async (toolCall: ToolCall) => {
    console.log("[ToolApprovalContainer] Approving tool:", toolCall);

    // 标记为处理中
    setProcessing((prev) => ({
      ...prev,
      [toolCall.tool_name]: true,
    }));

    try {
      // 执行工具
      console.log(
        "[ToolApprovalContainer] Calling executeApprovedTools with:",
        toolCall
      );
      const results = await executeApprovedTools([toolCall]);
      console.log("[ToolApprovalContainer] Tool execution results:", results);

      // 将工具执行结果添加到最近的助手消息中
      appendToolResultsToMessage(results);

      // 标记为处理完成
      setProcessing((prev) => ({
        ...prev,
        [toolCall.tool_name]: false,
      }));
    } catch (error) {
      console.error("[ToolApprovalContainer] Failed to execute tool:", error);
      // 清除处理状态
      setProcessing((prev) => ({
        ...prev,
        [toolCall.tool_name]: false,
      }));
    }
  };

  // 拒绝工具
  const handleReject = (toolCall: ToolCall) => {
    rejectTools([toolCall]);
  };

  // 批准所有工具
  const handleApproveAll = async () => {
    if (pendingApprovals.length === 0) return;

    // 标记所有为处理中
    const allProcessing = pendingApprovals.reduce((acc, tool) => {
      acc[tool.tool_name] = true;
      return acc;
    }, {} as Record<string, boolean>);

    setProcessing(allProcessing);

    try {
      // 执行所有工具
      const results = await executeApprovedTools(pendingApprovals);

      // 将工具执行结果添加到最近的助手消息中
      appendToolResultsToMessage(results);

      // 重置处理状态
      setProcessing({});
    } catch (error) {
      console.error("Failed to execute all tools:", error);
      setProcessing({});
    }
  };

  // 拒绝所有工具
  const handleRejectAll = () => {
    if (pendingApprovals.length === 0) return;
    clearPendingApprovals();
  };

  // 如果没有待审批工具，不渲染
  if (pendingApprovals.length === 0) {
    return null;
  }

  return (
    <div className="tool-approval-container">
      <div className="tool-approval-header">
        <h2 className="tool-approval-title">
          待审批工具 ({pendingApprovals.length})
        </h2>
        <div className="tool-approval-actions">
          <button
            className="approve-all-button"
            onClick={handleApproveAll}
            disabled={pendingApprovals.length === 0}
          >
            批准全部
          </button>
          <button
            className="reject-all-button"
            onClick={handleRejectAll}
            disabled={pendingApprovals.length === 0}
          >
            拒绝全部
          </button>
        </div>
      </div>

      <div className="tool-approval-list">
        {pendingApprovals.map((toolCall, index) => (
          <div
            key={`${toolCall.tool_name}-${index}`}
            className="tool-approval-item"
          >
            <ToolApprovalCard
              toolCall={toolCall}
              onApprove={handleApprove}
              onReject={handleReject}
            />
            {processing[toolCall.tool_name] && (
              <div className="tool-processing-overlay">
                <div className="tool-processing-spinner"></div>
                <span>处理中...</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToolApprovalContainer;
