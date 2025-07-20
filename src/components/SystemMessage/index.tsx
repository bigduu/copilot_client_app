import React, { useState, useEffect } from "react";
import { Card, Space, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import { useChats } from "../../hooks/useChats";
import { SystemPromptService } from "../../services/SystemPromptService";

const { Text } = Typography;
const { useToken } = theme;

interface SystemMessageProps {
  isExpandedView?: boolean;
  expanded?: boolean;
  onExpandChange?: (expanded: boolean) => void;
}

const SystemMessage: React.FC<SystemMessageProps> = ({
  isExpandedView = false,
  expanded: controlledExpanded,
  onExpandChange,
}) => {
  // console.log("SystemMessage component rendering");
  const { token } = useToken();

  // Get the current chat context
  const { currentChat } = useChats();
  // TODO: systemPrompt 需要从 currentChat 中获取
  const systemPrompt = currentChat?.systemPrompt || "";

  // State for category description
  const [categoryDescription, setCategoryDescription] = useState<string>("");

  // Get system prompt service
  const systemPromptService = React.useMemo(
    () => SystemPromptService.getInstance(),
    []
  );

  // Effect to load category description
  useEffect(() => {
    const loadCategoryDescription = async () => {
      try {
        // If chat has a systemPromptId, get the preset description
        if (currentChat?.systemPromptId) {
          const preset = await systemPromptService.findPresetById(
            currentChat.systemPromptId
          );
          if (preset?.description) {
            setCategoryDescription(preset.description);
            return;
          }
        }

        // If chat has toolCategory, get categories and find description
        if (currentChat?.toolCategory) {
          const presets = await systemPromptService.getSystemPromptPresets();
          const matchingPreset = presets.find(
            (preset) => preset.category === currentChat.toolCategory
          );
          if (matchingPreset?.description) {
            setCategoryDescription(matchingPreset.description);
            return;
          }
        }

        // Throw error when unable to get category description
        throw new Error(
          "Unable to get category description, frontend does not provide default values"
        );
      } catch (error) {
        console.error("Failed to load category description:", error);
        throw new Error(
          "Failed to load category description, frontend does not provide default values"
        );
      }
    };

    loadCategoryDescription();
  }, [
    currentChat?.systemPromptId,
    currentChat?.toolCategory,
    systemPromptService,
  ]);

  // Content to display: prioritize category description, then fallback
  const promptToDisplay = React.useMemo(() => {
    if (categoryDescription) {
      return categoryDescription;
    }

    // Get system prompt, do not provide default values
    const content = currentChat?.systemPrompt || systemPrompt;

    if (!content) {
      throw new Error("System prompt not configured");
    }

    if (typeof content === "string") {
      const trimmedContent = content.trim();
      if (!trimmedContent) {
        throw new Error("System prompt is empty");
      }
      return trimmedContent;
    }
    throw new Error("System prompt format error");
  }, [categoryDescription, currentChat?.systemPrompt, systemPrompt]);

  // Local state for expand/collapse
  const [uncontrolledExpanded, setUncontrolledExpanded] =
    useState(isExpandedView);
  const expanded =
    controlledExpanded !== undefined
      ? controlledExpanded
      : uncontrolledExpanded;

  // Get summary (first line or truncated)
  const summary =
    promptToDisplay.split("\n")[0].slice(0, 80) +
    (promptToDisplay.length > 80 ? "..." : "");

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        maxHeight: expanded ? "80vh" : "8vh",
        overflowY: expanded ? "auto" : "hidden",
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
        cursor: "pointer",
      }}
      onClick={() => {
        if (onExpandChange) {
          onExpandChange(!expanded);
        } else {
          setUncontrolledExpanded((prev) => !prev);
        }
      }}
    >
      <Space
        direction="vertical"
        size={token.marginXS}
        style={{ width: "100%" }}
      >
        <Text type="secondary" strong style={{ fontSize: token.fontSizeSM }}>
          System Prompt
        </Text>
        <div
          style={{
            display: "flex",
            gap: token.marginSM,
            alignItems: "flex-start",
          }}
        >
          <div style={{ flex: 1 }}>
            {expanded ? (
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <Text
                      style={{ marginBottom: token.marginSM, display: "block" }}
                    >
                      {children}
                    </Text>
                  ),
                  ol: ({ children }) => (
                    <ol
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ol>
                  ),
                  ul: ({ children }) => (
                    <ul
                      style={{ marginBottom: token.marginSM, paddingLeft: 20 }}
                    >
                      {children}
                    </ul>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: token.marginXS }}>{children}</li>
                  ),
                  h1: ({ children }) => (
                    <Text
                      strong
                      style={{
                        fontSize: token.fontSizeHeading3,
                        marginBottom: token.marginSM,
                        display: "block",
                      }}
                    >
                      {children}
                    </Text>
                  ),
                }}
              >
                {promptToDisplay}
              </ReactMarkdown>
            ) : (
              <Text style={{ color: token.colorTextSecondary }}>{summary}</Text>
            )}
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default SystemMessage;
