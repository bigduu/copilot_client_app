import React, { useState, useEffect } from "react";
import { Card, Typography } from "antd";
import ReactMarkdown from "react-markdown";
import "../ChatView/styles.css";

const { Text } = Typography;

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

  // Get system prompt directly from localStorage
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("system_prompt");
      if (saved && saved.trim()) {
        console.log(
          "Found system prompt in localStorage, length:",
          saved.length
        );
        return saved;
      }
      console.log("No system prompt in localStorage, using default");
      return DEFAULT_MESSAGE;
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      return DEFAULT_MESSAGE;
    }
  });

  // Listen for storage events to update when prompt changes
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "system_prompt" && event.newValue) {
        console.log("System prompt changed in storage, updating");
        setSystemPrompt(event.newValue);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Use default text if system prompt is somehow empty
  const promptToDisplay =
    systemPrompt && systemPrompt.trim() ? systemPrompt : DEFAULT_MESSAGE;

  return (
    <div className="message-container assistant system-message">
      <Text strong>System</Text>
      <Card size="small" className="message-card assistant system">
        <ReactMarkdown
          components={{
            p: ({ children }) => (
              <p className="markdown-paragraph">{children}</p>
            ),
            ol: ({ children }) => <ol className="markdown-list">{children}</ol>,
            ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
            li: ({ children }) => (
              <li className="markdown-list-item">{children}</li>
            ),
          }}
        >
          {promptToDisplay}
        </ReactMarkdown>
      </Card>
    </div>
  );
};

export default SystemMessage;
