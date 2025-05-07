import React from "react";
import { Alert } from "antd";
import ReactMarkdown from "react-markdown";
import { useChat } from "../../contexts/ChatContext";
import { InfoCircleOutlined } from "@ant-design/icons";
import "../ChatView/styles.css";

// Default message to use as fallback
const DEFAULT_MESSAGE = `# Hello! I'm your AI Assistant 👋

I'm here to help you with:

* Writing and reviewing code
* Answering questions
* Solving problems
* Explaining concepts
* And much more!

I'll respond using markdown formatting to make information clear and well-structured. Feel free to ask me anything!

---
Let's get started - what can I help you with today?`;

const SystemMessage: React.FC = () => {
  console.log("SystemMessage component rendering");

  // Get the system prompt from the current chat context
  const { currentChat, systemPrompt } = useChat();

  // Use the current chat's system prompt if available, otherwise fall back to global
  const promptToDisplay =
    (currentChat?.systemPrompt || systemPrompt || DEFAULT_MESSAGE).trim() ||
    DEFAULT_MESSAGE;

  return (
    <Alert
      type="info"
      icon={<InfoCircleOutlined />}
      className="system-message"
      message={
        <div className="system-message-content">
          <ReactMarkdown
            components={{
              p: ({ children }) => (
                <p className="markdown-paragraph">{children}</p>
              ),
              ol: ({ children }) => (
                <ol className="markdown-list">{children}</ol>
              ),
              ul: ({ children }) => (
                <ul className="markdown-list">{children}</ul>
              ),
              li: ({ children }) => (
                <li className="markdown-list-item">{children}</li>
              ),
            }}
          >
            {promptToDisplay}
          </ReactMarkdown>
        </div>
      }
    />
  );
};

export default SystemMessage;
