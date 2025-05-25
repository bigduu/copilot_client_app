import React from "react";
import { Collapse, theme } from "antd";
import { ToolCall } from "../../../utils/toolParser";
import ToolApprovalCard from "../../ToolApprovalCard";

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
      <Collapse
        ghost
        defaultActiveKey={["1"]}
        style={{ background: "transparent", padding: 0 }}
      >
        <Collapse.Panel
          header={`检测到 ${toolCalls.length} 个工具调用`}
          key="1"
          style={{ border: "none" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {toolCalls.map((toolCall, index) => (
              <ToolApprovalCard
                key={index}
                toolCall={toolCall}
                onApprove={onApprove}
                onReject={onReject}
              />
            ))}
          </div>
        </Collapse.Panel>
      </Collapse>
    </div>
  );
};

export default ToolCallsSection;
