import React, { useState, useMemo, useEffect } from "react";
import {
  Button,
  Space,
  Tooltip,
  Spin,
  theme,
  Tag,
  Alert,
  Typography,
} from "antd";
import { SettingOutlined, ToolOutlined, LockOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../SystemPromptModal";
import InputPreview from "./InputPreview";
import ToolSelector from "../ToolSelector";
import { useChats } from "../../hooks/useChats";
import { useChatInput } from "../../hooks/useChatInput";
import { useToolCategoryValidation } from "../../hooks/useToolCategoryValidation";
import { useSystemPrompt } from "../../hooks/useSystemPrompt";
import { getCategoryDisplayInfoAsync } from "../../utils/chatUtils";

const { useToken } = theme;
const { Text } = Typography;

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
  const { currentMessages, currentChat } = useChats();
  // TODO: selectedSystemPromptPresetId 需要从新的 store 中获取
  const selectedSystemPromptPresetId = null;

  // Use system prompt hook instead of direct service
  const systemPromptId =
    currentChat?.systemPromptId || selectedSystemPromptPresetId;
  const { currentSystemPromptInfo } = useSystemPrompt(systemPromptId);

  // Check if in tool-specific mode
  const isToolSpecificMode = currentSystemPromptInfo?.mode === "tool_specific";
  const isRestrictConversation = currentSystemPromptInfo?.restrictConversation;
  const allowedTools = currentSystemPromptInfo?.allowedTools || [];
  const autoToolPrefix = currentSystemPromptInfo?.autoToolPrefix;

  // Check if System Prompt is locked
  const isSystemPromptLocked = Boolean(currentChat?.systemPromptId);

  // Get locked mode display information
  const [lockedModeInfo, setLockedModeInfo] = useState<any>(null);

  useEffect(() => {
    const loadLockedModeInfo = async () => {
      if (!isSystemPromptLocked || !currentSystemPromptInfo) {
        setLockedModeInfo(null);
        return;
      }

      try {
        const categoryInfo = await getCategoryDisplayInfoAsync(
          currentSystemPromptInfo.category
        );
        setLockedModeInfo({
          ...categoryInfo,
          presetName: currentSystemPromptInfo.name,
          presetDescription: currentSystemPromptInfo.description,
        });
      } catch (error) {
        console.error("Failed to load locked mode category info:", error);
        setLockedModeInfo(null);
      }
    };

    loadLockedModeInfo();
  }, [isSystemPromptLocked, currentSystemPromptInfo]);

  // Tool category validation logic
  const {
    validateMessage,
    isStrictMode,
    getStrictModePlaceholder,
    currentCategoryInfo,
  } = useToolCategoryValidation(currentChat?.toolCategory);

  // Use the new chat input hook for state management
  const {
    content,
    setContent,
    referenceText,
    images,
    handleSubmit,
    handleRetry,
    handleCloseReferencePreview,
    setImages,
    contextHolder,
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
        padding: token.paddingMD,
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
        <div
          style={{
            display: "flex",
            gap: token.marginXS,
            alignItems: "center",
            width: "100%",
          }}
        >
          {isSystemPromptLocked && lockedModeInfo ? (
            // Display locked mode information
            <Tooltip
              title={
                <div>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                    🔒 Mode Locked
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    {lockedModeInfo.presetDescription}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>
                    To switch modes, create a new chat
                  </div>
                </div>
              }
            >
              <Button
                icon={<LockOutlined />}
                size="large"
                style={{
                  cursor: "default",
                  minWidth: "auto",
                  flexShrink: 0,
                  maxWidth: "120px",
                }}
                disabled
              >
                <span style={{ fontSize: "12px", marginRight: "4px" }}>
                  {lockedModeInfo.icon}
                </span>
                <Text
                  ellipsis
                  style={{
                    color: token.colorTextSecondary,
                    fontSize: "11px",
                    fontWeight: 500,
                    maxWidth: "60px",
                  }}
                >
                  {lockedModeInfo.presetName}
                </Text>
              </Button>
            </Tooltip>
          ) : (
            // Display settings button (unlocked state)
            <Tooltip title="Customize System Prompt">
              <Button
                icon={<SettingOutlined />}
                onClick={() => setPromptModalOpen(true)}
                aria-label="Customize System Prompt"
                size="large"
                style={{
                  minWidth: "auto",
                  flexShrink: 0,
                  width: "40px",
                }}
              />
            </Tooltip>
          )}
          <MessageInput
            value={content}
            onChange={handleInputChange}
            onSubmit={handleSubmit}
            onRetry={handleRetry}
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
        </div>

        <ToolSelector
          visible={showToolSelector}
          onSelect={handleToolSelect}
          onCancel={handleToolSelectorCancel}
          onAutoComplete={handleAutoComplete}
          searchText={toolSearchText}
          categoryId={currentChat?.toolCategory}
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

      {/* Only show SystemPromptModal when not locked */}
      {!isSystemPromptLocked && (
        <SystemPromptModal
          open={isPromptModalOpen}
          onClose={() => setPromptModalOpen(false)}
        />
      )}
    </div>
  );
};
