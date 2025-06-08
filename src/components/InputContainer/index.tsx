import React from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";
import InputPreview from "./InputPreview";
import { useChat } from "../../contexts/ChatContext";
import { useChatInput } from "../../hooks/useChatInput";

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
  const { currentMessages } = useChat();

  // Use the new chat input hook for state management
  const {
    content,
    setContent,
    referenceText,
    handleSubmit,
    handleRetry,
    handleCloseReferencePreview,
  } = useChatInput();

  // Generate placeholder text based on reference
  const placeholder = referenceText
    ? "Send a message (includes reference)"
    : "Send a message...";

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
      {referenceText && (
        <InputPreview
          text={referenceText}
          onClose={handleCloseReferencePreview}
        />
      )}

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
          value={content}
          onChange={setContent}
          onSubmit={handleSubmit}
          onRetry={handleRetry}
          isStreaming={isStreaming}
          isCenteredLayout={isCenteredLayout}
          placeholder={placeholder}
          hasMessages={currentMessages.length > 0}
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
