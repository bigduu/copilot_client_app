import React from "react";
import { ToolCall } from "../../utils/toolParser";
import "./styles.css";

interface ToolApprovalCardProps {
  toolCall: ToolCall;
  onApprove: (toolCall: ToolCall) => void;
  onReject: (toolCall: ToolCall) => void;
}

export const ToolApprovalCard: React.FC<ToolApprovalCardProps> = ({
  toolCall,
  onApprove,
  onReject,
}) => {
  // 根据工具类型选择不同的图标
  const getToolIcon = () => {
    switch (toolCall.tool_name) {
      case "execute_command":
        return "💻";
      case "create_file":
      case "update_file":
      case "delete_file":
        return "📄";
      case "search_files":
        return "🔍";
      default:
        return "🛠️";
    }
  };

  // 获取工具参数的友好展示
  const renderParameters = () => {
    const params = toolCall.parameters;

    if (toolCall.tool_name === "execute_command" && params.command) {
      return (
        <div className="tool-parameter command">
          <span className="param-label">命令：</span>
          <code className="command-code">{params.command}</code>
        </div>
      );
    }

    return (
      <div className="tool-parameters">
        {Object.entries(params).map(([key, value]) => (
          <div key={key} className="tool-parameter">
            <span className="param-label">{key}：</span>
            <span className="param-value">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // 获取工具类型的友好名称
  const getToolTypeName = () => {
    return toolCall.tool_type === "local" ? "本地工具" : "MCP工具";
  };

  // 获取工具的友好名称
  const getToolName = () => {
    switch (toolCall.tool_name) {
      case "execute_command":
        return "执行命令";
      case "create_file":
        return "创建文件";
      case "update_file":
        return "更新文件";
      case "delete_file":
        return "删除文件";
      case "search_files":
        return "搜索文件";
      default:
        return toolCall.tool_name;
    }
  };

  return (
    <div
      className={`tool-approval-card ${
        toolCall.requires_approval ? "requires-approval" : "safe-tool"
      }`}
    >
      <div className="tool-header">
        <div className="tool-icon">{getToolIcon()}</div>
        <div className="tool-info">
          <h3 className="tool-name">{getToolName()}</h3>
          <span className="tool-type">{getToolTypeName()}</span>
          {toolCall.requires_approval && (
            <span className="approval-required">需要批准</span>
          )}
        </div>
      </div>

      <div className="tool-content">{renderParameters()}</div>

      <div className="tool-actions">
        <button className="approve-button" onClick={() => onApprove(toolCall)}>
          批准
        </button>
        <button className="reject-button" onClick={() => onReject(toolCall)}>
          拒绝
        </button>
      </div>
    </div>
  );
};

export default ToolApprovalCard;
