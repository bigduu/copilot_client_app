import React, { useState } from "react";
import { Collapse, Typography, theme } from "antd";

const { Text } = Typography;
const { useToken } = theme;

interface ProcessorUpdatesSectionProps {
  processorUpdates: string[];
  position?: "absolute" | "relative";
}

const ProcessorUpdatesSection: React.FC<ProcessorUpdatesSectionProps> = ({
  processorUpdates,
  position = "relative",
}) => {
  const [showProcessorUpdates, setShowProcessorUpdates] = useState(false);
  const { token } = useToken();

  if (!processorUpdates || processorUpdates.length === 0) return null;

  const containerStyle = {
    background: "transparent",
    padding: 0,
    marginTop: token.marginSM,
    ...(position === "absolute"
      ? {
          position: "absolute" as const,
          bottom: token.paddingXS,
          left: token.padding,
          right: token.padding,
          zIndex: 1,
        }
      : {}),
  };

  return (
    <Collapse
      ghost
      collapsible="header"
      activeKey={showProcessorUpdates ? ["1"] : []}
      onChange={() => setShowProcessorUpdates(!showProcessorUpdates)}
      style={containerStyle}
    >
      <Collapse.Panel
        header={
          <Text
            type="secondary"
            style={{ fontSize: token.fontSizeSM, cursor: "pointer" }}
          >
            {showProcessorUpdates ? "Hide" : "Show"} processor updates (
            {processorUpdates.length})
          </Text>
        }
        key="1"
        style={{ border: "none" }}
      >
        <div
          style={{
            fontSize: token.fontSizeSM,
            color: token.colorTextTertiary,
            maxHeight: "100px",
            overflowY: "auto",
            padding: `${token.paddingXXS}px ${token.paddingXS}px`,
            background: token.colorBgLayout,
            borderRadius: token.borderRadiusSM,
          }}
        >
          {processorUpdates.map((update, index) => (
            <div
              key={index}
              style={{
                marginBottom: token.marginXXS,
                padding: token.paddingXXS,
                borderRadius: token.borderRadiusXS,
                background:
                  update.includes("成功") || update.includes("success")
                    ? token.colorSuccessBgHover
                    : update.includes("失败") ||
                      update.includes("failed") ||
                      update.includes("error")
                    ? token.colorErrorBgHover
                    : token.colorInfoBgHover,
              }}
            >
              {update}
            </div>
          ))}
        </div>
      </Collapse.Panel>
    </Collapse>
  );
};

export default ProcessorUpdatesSection;
