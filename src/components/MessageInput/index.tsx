import React, { useRef } from "react";
import { Input, Button, Space, theme } from "antd";
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
}) => {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isStreaming && !disabled) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmedContent = value.trim();
    if (!trimmedContent || isStreaming || disabled) return;

    onSubmit(trimmedContent);
  };

  const handleRetry = () => {
    if (isStreaming || disabled || !onRetry) return;
    onRetry();
  };

  return (
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
  );
};
