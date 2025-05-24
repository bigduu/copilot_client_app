import React, { useState, useEffect } from "react";
import { ToolCall } from "../../utils/toolParser";
import ToolApprovalCard from "../ToolApprovalCard";
import "./styles.css";
import { useMessageProcessorContext } from "../../contexts/MessageProcessorContext";

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

  // 本地状态用于跟踪工具执行状态
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  // 批准工具
  const handleApprove = async (toolCall: ToolCall) => {
    // 标记为处理中
    setProcessing((prev) => ({
      ...prev,
      [toolCall.tool_name]: true,
    }));

    try {
      // 执行工具
      await executeApprovedTools([toolCall]);

      // 标记为处理完成
      setProcessing((prev) => ({
        ...prev,
        [toolCall.tool_name]: false,
      }));
    } catch (error) {
      console.error("Failed to execute tool:", error);
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
      await executeApprovedTools(pendingApprovals);

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
