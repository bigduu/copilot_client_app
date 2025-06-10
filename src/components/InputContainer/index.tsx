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
import { ToolService } from "../../services/ToolService";
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

  // 服务实例
  const systemPromptService = SystemPromptService.getInstance();

  // 获取当前系统提示预设信息
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

  // 检查是否为工具专用模式
  const isToolSpecificMode = currentSystemPromptInfo?.mode === "tool_specific";
  const isRestrictConversation = currentSystemPromptInfo?.restrictConversation;
  const allowedTools = currentSystemPromptInfo?.allowedTools || [];
  const autoToolPrefix = currentSystemPromptInfo?.autoToolPrefix;

  // 检查 System Prompt 是否已锁定
  const isSystemPromptLocked = Boolean(currentChat?.systemPromptId);

  // 获取锁定的模式显示信息
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

  // 工具类别验证逻辑
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

    // 检查是否为严格模式
    if (isStrictMode()) {
      const strictPlaceholder = getStrictModePlaceholder();
      if (strictPlaceholder) {
        return strictPlaceholder;
      }
    }

    if (isToolSpecificMode) {
      if (isRestrictConversation) {
        return `仅支持工具调用 (允许的工具: ${allowedTools.join(", ")})`;
      } else if (autoToolPrefix) {
        return `自动前缀模式: ${autoToolPrefix} (输入 '/' 选择工具)`;
      } else {
        return `工具专用模式 (允许的工具: ${allowedTools.join(", ")})`;
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
      {/* 严格模式提示 */}
      {isStrictMode() && currentCategoryInfo && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>严格模式：{currentCategoryInfo.name} - 仅支持工具调用</span>
              <Tag color="red">严格模式已启用</Tag>
            </Space>
          }
          description="在此模式下，只能发送以 / 开头的工具调用命令"
        />
      )}

      {/* 工具专用模式提示 */}
      {!isStrictMode() && isToolSpecificMode && (
        <Alert
          type={isRestrictConversation ? "warning" : "info"}
          showIcon
          style={{ marginBottom: token.marginSM }}
          message={
            <Space wrap>
              <span>
                {isRestrictConversation
                  ? "严格模式：仅支持工具调用"
                  : "工具专用模式"}
              </span>
              {autoToolPrefix && (
                <Tag color="blue">
                  <ToolOutlined /> 自动前缀: {autoToolPrefix}
                </Tag>
              )}
            </Space>
          }
          description={
            allowedTools.length > 0 && (
              <Space wrap>
                <span>允许的工具:</span>
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
            // 显示锁定状态的模式信息
            <Tooltip
              title={
                <div>
                  <div style={{ fontWeight: "bold", marginBottom: 4 }}>
                    🔒 模式已锁定
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    {lockedModeInfo.presetDescription}
                  </div>
                  <div style={{ fontSize: "12px", opacity: 0.8 }}>
                    要切换模式，请创建新聊天
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
            // 显示设置按钮（未锁定状态）
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
          allowedTools={isToolSpecificMode ? allowedTools : undefined}
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

      {/* 只有在未锁定状态下才显示 SystemPromptModal */}
      {!isSystemPromptLocked && (
        <SystemPromptModal
          open={isPromptModalOpen}
          onClose={() => setPromptModalOpen(false)}
        />
      )}
    </div>
  );
};
