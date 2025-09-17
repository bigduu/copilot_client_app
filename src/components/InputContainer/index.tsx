import React, { useState, useMemo } from "react";
import { Space, theme, Tag, Alert } from "antd";
import { ToolOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import InputPreview from "./InputPreview";
import ToolSelector from "../ToolSelector";
import { useChatList } from "../../hooks/useChatList";
import { useChatControllerContext } from "../../contexts/ChatControllerContext";
import { useToolCategoryValidation } from "../../hooks/useToolCategoryValidation";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
// Removed getCategoryDisplayInfoAsync import since lock functionality is removed

const { useToken } = theme;

interface InputContainerProps {
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isCenteredLayout = false,
}) => {
  const [showToolSelector, setShowToolSelector] = useState(false);
  const [toolSearchText, setToolSearchText] = useState("");
  const { token } = useToken();
  const { currentMessages, currentChat } = useChatList();

  // Get state and actions from the state machine
  const { state, send, sendMessage, retryLastMessage } =
    useChatControllerContext();
  const isStreaming = state.matches("THINKING");

  // TODO: selectedSystemPromptPresetId needs to be retrieved from the new store
  const selectedSystemPromptPresetId = null;

  // Use system prompt hook instead of direct service
  const systemPromptId =
    currentChat?.config.systemPromptId || selectedSystemPromptPresetId;
  const { currentSystemPromptInfo } = useSystemPrompt(systemPromptId);

  // Check if in tool-specific mode
  const isToolSpecificMode = currentSystemPromptInfo?.mode === "tool_specific";
  const isRestrictConversation = currentSystemPromptInfo?.restrictConversation;
  const allowedTools = currentSystemPromptInfo?.allowedTools || [];
  const autoToolPrefix = currentSystemPromptInfo?.autoToolPrefix;

  // Removed lock functionality since everything is controlled by categories

  // Tool category validation logic
  const {
    validateMessage,
    isStrictMode,
    getStrictModePlaceholder,
    currentCategoryInfo,
  } = useToolCategoryValidation(currentChat?.config.toolCategory);

  // Use the new chat input hook for state management
  // State management for the input itself
  const [content, setContent] = useState("");
  const [images, setImages] = useState<any[]>([]);
  const [referenceText, setReferenceText] = useState<string | null>(null);

  // Create a new handleSubmit that uses our new hook
  const handleSubmit = () => {
    if (!content.trim() && images.length === 0) return;
    sendMessage(content, images);
    setContent("");
    setImages([]);
    setReferenceText(null); // Clear reference after sending
  };

  // Dummy functions to satisfy props, will be cleaned up
  const handleCloseReferencePreview = () => setReferenceText(null);
  const { contextHolder } = { contextHolder: null }; // Dummy

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

  // Generate placeholder text based on reference and current mode
  const placeholder = useMemo(() => {
    if (referenceText) {
      return "Send a message (includes reference)";
    }

    // Check if in strict mode
    if (isStrictMode()) {
      const strictPlaceholder = getStrictModePlaceholder();
      if (strictPlaceholder) {
        return strictPlaceholder;
      }
    }

    if (isToolSpecificMode) {
      if (isRestrictConversation) {
        return `Tool calls only (allowed tools: ${allowedTools.join(", ")})`;
      } else if (autoToolPrefix) {
        return `Auto-prefix mode: ${autoToolPrefix} (type '/' to select tools)`;
      } else {
        return `Tool-specific mode (allowed tools: ${allowedTools.join(", ")})`;
      }
    }

    return "Send a message... (type '/' for tools)";
  }, [
    referenceText,
    isToolSpecificMode,
    isRestrictConversation,
    allowedTools,
    autoToolPrefix,
    isStrictMode,
    getStrictModePlaceholder,
  ]);

  return (
    <div
      style={{
        padding: `${token.paddingLG}px ${token.paddingMD}px`,
        minHeight: "80px",
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
      }}
    >
      {/* Ant Design message context holder */}
      {contextHolder}
      {/* Strict mode alert */}
      {isStrictMode() && currentCategoryInfo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>
                Strict Mode: {currentCategoryInfo.name} - Tool calls only
              </span>
              <Tag color="red">Strict Mode Enabled</Tag>
            </Space>
          }
          description="In this mode, only tool call commands starting with / are allowed"
        />
      )}

      {/* Tool-specific mode alert */}
      {!isStrictMode() && isToolSpecificMode && (
        <Alert
          type={isRestrictConversation ? "warning" : "info"}
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>
                {isRestrictConversation
                  ? "Strict Mode: Tool calls only"
                  : "Tool-specific Mode"}
              </span>
              {autoToolPrefix && (
                <Tag color="blue">
                  <ToolOutlined /> Auto-prefix: {autoToolPrefix}
                </Tag>
              )}
            </Space>
          }
          description={
            allowedTools.length > 0 && (
              <Space wrap>
                <span>Allowed tools:</span>
                {allowedTools.map((tool: string) => (
                  <Tag key={tool} color="green">
                    /{tool}
                  </Tag>
                ))}
              </Space>
            )
          }
        />
      )}

      {referenceText && (
        <InputPreview
          text={referenceText}
          onClose={handleCloseReferencePreview}
        />
      )}

      <div style={{ position: "relative" }}>
        <MessageInput
          value={content}
          onChange={handleInputChange}
          onSubmit={handleSubmit}
          onRetry={retryLastMessage}
          onCancel={() => send({ type: "CANCEL" })}
          isStreaming={isStreaming}
          isCenteredLayout={isCenteredLayout}
          placeholder={placeholder}
          hasMessages={currentMessages.length > 0}
          images={images}
          onImagesChange={setImages}
          allowImages={true}
          isToolSelectorVisible={showToolSelector}
          validateMessage={validateMessage}
        />

        <ToolSelector
          visible={showToolSelector}
          onSelect={handleToolSelect}
          onCancel={handleToolSelectorCancel}
          onAutoComplete={handleAutoComplete}
          searchText={toolSearchText}
          categoryId={currentChat?.config.toolCategory}
          allowedTools={
            // In strict mode, tools are already filtered by backend, no need for frontend filtering
            isStrictMode() && currentCategoryInfo
              ? undefined
              : isToolSpecificMode
              ? allowedTools
              : undefined
          }
        />
      </div>
    </div>
  );
};
