import React, { useRef } from "react";
import { Input, Button, Space, theme, message } from "antd";
import { SendOutlined, SyncOutlined } from "@ant-design/icons";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string) => void;
  onRetry?: () => void;
  isStreaming: boolean;
  isCenteredLayout?: boolean;
  placeholder?: string;
  disabled?: boolean;
  showRetryButton?: boolean;
  hasMessages?: boolean;
  validateMessage?: (message: string) => {
    isValid: boolean;
    errorMessage?: string;
  };
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  onRetry,
  isStreaming,
  isCenteredLayout = false,
  placeholder = "Send a message...",
  disabled = false,
  showRetryButton = true,
  hasMessages = false,
  validateMessage,
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isStreaming && !disabled) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmedContent = value.trim();
    if (!trimmedContent || isStreaming || disabled) return;

    // If validation function is provided, validate first
    if (validateMessage) {
      const validation = validateMessage(trimmedContent);

      if (!validation.isValid) {
        // Show error message
        messageApi.error(
          validation.errorMessage || "Message format is incorrect"
        );
        return;
      }
    }

    onSubmit(trimmedContent);
  };

  const handleRetry = () => {
    if (isStreaming || disabled || !onRetry) return;
    onRetry();
  };

  return (
    <>
      {/* Ant Design message context holder */}
      {contextHolder}
      <Space.Compact block style={{ width: "100%" }}>
        <Input.TextArea
          ref={textAreaRef}
          autoSize={{ minRows: isCenteredLayout ? 3 : 1, maxRows: 8 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isStreaming}
          style={{
            resize: "none",
            borderRadius: 0,
            backgroundColor: token.colorBgContainer,
            padding: isCenteredLayout
              ? `${token.paddingSM}px ${token.padding}px`
              : undefined,
            fontSize: isCenteredLayout ? token.fontSizeLG : undefined,
          }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          disabled={!value.trim() || isStreaming || disabled}
          size={isCenteredLayout ? "large" : "middle"}
          style={{
            height: isCenteredLayout ? "auto" : undefined,
          }}
        >
          Send
        </Button>
        {showRetryButton && hasMessages && (
          <Button
            icon={<SyncOutlined spin={isStreaming} />}
            onClick={handleRetry}
            disabled={isStreaming || disabled || !onRetry}
            title="Regenerate last AI response"
            size={isCenteredLayout ? "large" : "middle"}
            style={{
              height: isCenteredLayout ? "auto" : undefined,
            }}
          />
        )}
      </Space.Compact>
    </>
  );
};
