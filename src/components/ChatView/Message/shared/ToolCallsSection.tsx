import React from "react";
import { Space, Typography, theme } from "antd";
import { ToolCall } from "../../../../utils/toolParser";
import ToolApprovalCard from "../../ToolApp/ToolApprovalCard";

const { Text } = Typography;
const { useToken } = theme;

interface ToolCallsSectionProps {
  toolCalls: ToolCall[];
  onApprove: (toolCall: ToolCall) => void;
  onReject: (toolCall: ToolCall) => void;
}

const ToolCallsSection: React.FC<ToolCallsSectionProps> = ({
  toolCalls,
  onApprove,
  onReject,
}) => {
  const { token } = useToken();

  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div style={{ marginTop: token.marginMD }}>
      <Text
        type="secondary"
        style={{
          marginBottom: token.marginSM,
          display: "block",
          fontSize: token.fontSizeSM,
          fontWeight: 500,
        }}
      >
        Detected {toolCalls.length} tool call
        {toolCalls.length > 1 ? "s" : " command"}:
      </Text>
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        {toolCalls.map((toolCall, index) => (
          <ToolApprovalCard
            key={index}
            toolCall={toolCall}
            onApprove={onApprove}
            onReject={onReject}
          />
        ))}
      </Space>
    </div>
  );
};

export default ToolCallsSection;
