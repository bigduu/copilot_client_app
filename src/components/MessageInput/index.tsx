import React, { useState, useRef, useEffect } from "react";
import { Input, Button, Space, theme } from "antd";
import { SendOutlined, SyncOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";

interface MessageInputProps {
  onSubmit?: (content: string) => void;
  isStreamingInProgress: boolean;
  isCenteredLayout?: boolean;
  referenceText?: string | null;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSubmit,
  isStreamingInProgress,
  isCenteredLayout = false,
  referenceText = null,
}) => {
  const [content, setContent] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const { sendMessage, initiateAIResponse, currentMessages } = useChat();

  // Insert reference text when it changes
  useEffect(() => {
    if (referenceText) {
      // Add a newline before and after the reference if there's already content
      const newContent = content
        ? `${content}\n\n${referenceText}\n\n`
        : `${referenceText}\n\n`;

      setContent(newContent);

      // Focus the textarea
      if (textAreaRef.current) {
        setTimeout(() => {
          textAreaRef.current?.focus();
          // Move cursor to the end
          const length = newContent.length;
          textAreaRef.current?.setSelectionRange(length, length);
        }, 50);
      }
    }
  }, [referenceText]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isStreamingInProgress) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || isStreamingInProgress) return;

    console.log("Submitting message:", trimmedContent);

    if (onSubmit) {
      onSubmit(trimmedContent);
    }

    try {
      await sendMessage(trimmedContent);
    } catch (error) {
      console.error("Error sending message:", error);
    }

    setContent("");
  };

  const handleAIRetry = async () => {
    if (isStreamingInProgress) return;

    try {
      await initiateAIResponse();
    } catch (error) {
      console.error("Error initiating AI response:", error);
    }
  };

  return (
    <Space.Compact block style={{ width: "100%" }}>
      <Input.TextArea
        ref={textAreaRef}
        autoSize={{ minRows: isCenteredLayout ? 3 : 1, maxRows: 8 }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Send a message..."
        disabled={isStreamingInProgress}
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
        disabled={!content.trim() || isStreamingInProgress}
        size={isCenteredLayout ? "large" : "middle"}
        style={{
          height: isCenteredLayout ? "auto" : undefined,
        }}
      >
        Send
      </Button>
      {currentMessages.length > 0 && (
        <Button
          icon={<SyncOutlined spin={isStreamingInProgress} />}
          onClick={handleAIRetry}
          disabled={isStreamingInProgress}
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
