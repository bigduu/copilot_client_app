import React, { useState, useRef } from "react";
import { Input, Button, Space } from "antd";
import { SendOutlined, SyncOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import "./styles.css";

interface MessageInputProps {
  onSubmit?: (content: string) => void;
  isStreamingInProgress: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSubmit,
  isStreamingInProgress,
}) => {
  const [content, setContent] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const { sendMessage, initiateAIResponse, currentMessages } = useChat();

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
    <div className="message-input-container">
      <Space.Compact style={{ width: "100%" }}>
        <Input.TextArea
          ref={textAreaRef}
          autoSize={{ minRows: 1, maxRows: 5 }}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={isStreamingInProgress}
          className="message-input"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          disabled={!content.trim() || isStreamingInProgress}
          className="send-button"
        >
          Send
        </Button>
        {currentMessages.length > 0 && (
          <Button
            icon={<SyncOutlined />}
            onClick={handleAIRetry}
            disabled={isStreamingInProgress}
            title="Regenerate last AI response"
            className="retry-button"
          />
        )}
      </Space.Compact>
    </div>
  );
};
