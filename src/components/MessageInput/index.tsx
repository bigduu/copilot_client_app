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
  const [hiddenReference, setHiddenReference] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const { sendMessage, initiateAIResponse, currentMessages } = useChat();

  // Store or clear reference text when it changes
  useEffect(() => {
    if (referenceText) {
      setHiddenReference(referenceText);

      // Focus the textarea
      if (textAreaRef.current) {
        setTimeout(() => {
          textAreaRef.current?.focus();
        }, 50);
      }
    } else {
      // Clear the hidden reference when referenceText becomes null
      setHiddenReference(null);
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
    if ((!trimmedContent && !hiddenReference) || isStreamingInProgress) return;

    console.log("Submitting message:", trimmedContent);

    let messageToSend = trimmedContent;

    // Append reference text if it exists (but only in the background)
    if (hiddenReference) {
      messageToSend = trimmedContent
        ? `${hiddenReference}\n\n${trimmedContent}`
        : hiddenReference;
    }

    if (onSubmit) {
      onSubmit(messageToSend);
    }

    try {
      await sendMessage(messageToSend);
    } catch (error) {
      console.error("Error sending message:", error);
    }

    setContent("");
    setHiddenReference(null);
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
        placeholder={
          hiddenReference
            ? "Send a message (includes reference)"
            : "Send a message..."
        }
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
        disabled={
          (!content.trim() && !hiddenReference) || isStreamingInProgress
        }
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
