import React from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";

const { useToken } = theme;

interface InputContainerProps {
  isStreaming: boolean;
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isStreaming,
  isCenteredLayout = false,
}) => {
  const [isPromptModalOpen, setPromptModalOpen] = React.useState(false);
  const { token } = useToken();

  return (
    <div
      style={{
        padding: token.paddingMD,
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
      }}
    >
      <Space.Compact block>
        <Tooltip title="Customize System Prompt">
          <Button
            icon={<SettingOutlined />}
            onClick={() => setPromptModalOpen(true)}
            aria-label="Customize System Prompt"
            size={isCenteredLayout ? "large" : "middle"}
            style={
              isCenteredLayout
                ? {
                    height: "auto",
                    padding: `${token.paddingSM}px ${token.paddingContentHorizontal}px`,
                  }
                : {}
            }
          />
        </Tooltip>
        <MessageInput
          isStreamingInProgress={isStreaming}
          isCenteredLayout={isCenteredLayout}
        />
      </Space.Compact>

      {isStreaming && (
        <Space
          style={{
            marginTop: token.marginSM,
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
          size={token.marginXS}
        >
          <Spin size="small" />
          <span>AI is thinking...</span>
        </Space>
      )}

      <SystemPromptModal
        open={isPromptModalOpen}
        onClose={() => setPromptModalOpen(false)}
      />
    </div>
  );
};
