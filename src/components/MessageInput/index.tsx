import React, { useState, useEffect } from "react";
import { Input, Button, Tooltip } from "antd";
import { SendOutlined, ReloadOutlined } from "@ant-design/icons";
import { useChat } from "../../contexts/ChatContext";
import "./styles.css";

export const MessageInput: React.FC = () => {
  const [inputValue, setInputValue] = useState("");
  const [isStuck, setIsStuck] = useState(false);
  const { sendMessage, isStreaming, setIsStreaming, currentChatId } = useChat();

  // Add a timer to detect if streaming gets stuck
  useEffect(() => {
    let stuckTimer: number | null = null;

    if (isStreaming) {
      // If streaming continues for more than 30 seconds, consider it stuck
      stuckTimer = window.setTimeout(() => {
        console.log("Streaming appears to be stuck");
        setIsStuck(true);
      }, 30000);
    } else {
      setIsStuck(false);
    }

    return () => {
      if (stuckTimer) {
        clearTimeout(stuckTimer);
      }
    };
  }, [isStreaming]);

  const handleSend = () => {
    if (inputValue.trim()) {
      console.log("Attempting to send message:", {
        inputValue: inputValue.trim(),
        isStreaming,
        hasChatId: !!currentChatId,
      });

      if (isStreaming) {
        console.warn("Cannot send message while streaming");
        return;
      }

      try {
        sendMessage(inputValue.trim());
        setInputValue("");
      } catch (error) {
        console.error("Error sending message:", error);
        alert("Failed to send message. Please try again.");
      }
    }
  };

  const handleResetStreaming = () => {
    console.log("Manually resetting streaming state");
    setIsStreaming(false);
    setIsStuck(false);
  };

  return (
    <div className="message-input-container">
      <Input.TextArea
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder="Type your message..."
        autoSize={{ minRows: 1, maxRows: 5 }}
        onPressEnter={(e) => {
          if (!e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={isStreaming}
        className="message-input"
      />
      {isStuck ? (
        <Tooltip title="Reset streaming state if stuck">
          <Button
            icon={<ReloadOutlined />}
            onClick={handleResetStreaming}
            type="default"
            danger
          />
        </Tooltip>
      ) : (
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={isStreaming}
          disabled={!inputValue.trim()}
        >
          Send
        </Button>
      )}
    </div>
  );
};
