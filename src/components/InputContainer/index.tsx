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
import { useChat } from "../../contexts/ChatContext";
import { useChatInput } from "../../hooks/useChatInput";
import { useToolCategoryValidation } from "../../hooks/useToolCategoryValidation";

import { SystemPromptService } from "../../services/SystemPromptService";
import { getCategoryDisplayInfo } from "../../utils/chatUtils";

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
  const { currentMessages, currentChat, selectedSystemPromptPresetId } =
    useChat();

  // Service instances
  const systemPromptService = SystemPromptService.getInstance();

  // Get current system prompt preset information
  const [currentSystemPromptInfo, setCurrentSystemPromptInfo] =
    useState<any>(null);

  useEffect(() => {
    const loadSystemPromptInfo = async () => {
      const systemPromptId =
        currentChat?.systemPromptId || selectedSystemPromptPresetId;
      if (!systemPromptId) {
        setCurrentSystemPromptInfo(null);
        return;
      }

      try {
        const info = await systemPromptService.findPresetById(systemPromptId);
        setCurrentSystemPromptInfo(info);
      } catch (error) {
        console.error("Failed to load system prompt info:", error);
        setCurrentSystemPromptInfo(null);
      }
    };

    loadSystemPromptInfo();
  }, [
    currentChat?.systemPromptId,
    selectedSystemPromptPresetId,
    systemPromptService,
  ]);

  // Check if in tool-specific mode
  const isToolSpecificMode = currentSystemPromptInfo?.mode === "tool_specific";
  const isRestrictConversation = currentSystemPromptInfo?.restrictConversation;
  const allowedTools = currentSystemPromptInfo?.allowedTools || [];
  const autoToolPrefix = currentSystemPromptInfo?.autoToolPrefix;

  // Check if System Prompt is locked
  const isSystemPromptLocked = Boolean(currentChat?.systemPromptId);

  // Get locked mode display information
  const lockedModeInfo = useMemo(() => {
    if (!isSystemPromptLocked || !currentSystemPromptInfo) return null;

    const categoryInfo = getCategoryDisplayInfo(
      currentSystemPromptInfo.category
    );
    return {
      ...categoryInfo,
      presetName: currentSystemPromptInfo.name,
      presetDescription: currentSystemPromptInfo.description,
    };
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
        <Space.Compact block>
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
                size={isCenteredLayout ? "large" : "middle"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: token.marginXS,
                  cursor: "default",
                  ...(isCenteredLayout
                    ? {
                        height: "auto",
                        padding: `${token.paddingSM}px ${token.paddingContentHorizontal}px`,
                      }
                    : {}),
                }}
                disabled
              >
                <span style={{ fontSize: "14px" }}>{lockedModeInfo.icon}</span>
                <Text
                  style={{
                    color: token.colorTextSecondary,
                    fontSize: isCenteredLayout ? "14px" : "12px",
                    fontWeight: 500,
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
            validateMessage={validateMessage}
          />
        </Space.Compact>

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
