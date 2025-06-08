import React, { useState } from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";
import InputPreview from "./InputPreview";
import ToolSelector from "../ToolSelector";
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
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [toolSearchText, setToolSearchText] = useState("");
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

  // Handle input changes to detect tool selector trigger
  const handleInputChange = (value: string) => {
    setContent(value);

    // Check if user typed '/' at the end
    if (value.endsWith("/")) {
      setShowToolSelector(true);
      setToolSearchText("");
    } else if (value.includes("/") && showToolSelector) {
      // Extract search text after the last '/'
      const slashIndex = value.lastIndexOf("/");
      const searchText = value.substring(slashIndex + 1);
      setToolSearchText(searchText);
    } else {
      setShowToolSelector(false);
    }
  };

  // Handle tool selection
  const handleToolSelect = (toolName: string) => {
    // Replace the tool selection part with the selected tool
    const slashIndex = content.lastIndexOf("/");
    const beforeSlash = content.substring(0, slashIndex);
    setContent(`${beforeSlash}/${toolName} `);
    setShowToolSelector(false);
  };

  // Handle tool selector cancel
  const handleToolSelectorCancel = () => {
    setShowToolSelector(false);
  };

  // Handle auto-completion (space/tab key)
  const handleAutoComplete = (toolName: string) => {
    // Replace the tool selection part with the selected tool and add space
    const slashIndex = content.lastIndexOf("/");
    const beforeSlash = content.substring(0, slashIndex);
    setContent(`${beforeSlash}/${toolName} `);
    setShowToolSelector(false);
  };

  // Generate placeholder text based on reference
  const placeholder = referenceText
    ? "Send a message (includes reference)"
    : "Send a message... (type '/' for tools)";

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

      <div style={{ position: "relative" }}>
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
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onRetry={handleRetry}
            isStreaming={isStreaming}
            isCenteredLayout={isCenteredLayout}
            placeholder={placeholder}
            hasMessages={currentMessages.length > 0}
          />
        </Space.Compact>

        <ToolSelector
          visible={showToolSelector}
          onSelect={handleToolSelect}
          onCancel={handleToolSelectorCancel}
          onAutoComplete={handleAutoComplete}
          searchText={toolSearchText}
        />
      </div>

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
