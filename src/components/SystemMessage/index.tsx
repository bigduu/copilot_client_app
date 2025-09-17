import React, { useState, useEffect } from "react";
import { Card, Space, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import { useChatManager } from "../../hooks/useChatManager";
import { SystemPromptService } from "../../services/SystemPromptService";

const { Text } = Typography;
const { useToken } = theme;

interface SystemMessageProps {
  // Removed collapsible props since we're not using them anymore
}

const SystemMessage: React.FC<SystemMessageProps> = () => {
  const { token } = useToken();

  // Get the current chat context from the new hook
  const { currentChat } = useChatManager();

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
      if (!currentChat?.config) return;

      try {
        const { systemPromptId, toolCategory } = currentChat.config;

        if (systemPromptId) {
          const preset = await systemPromptService.findPresetById(
            systemPromptId
          );
          if (preset?.description) {
            setCategoryDescription(preset.description);
            return;
          }
        }

        if (toolCategory) {
          const presets = await systemPromptService.getSystemPromptPresets();
          const matchingPreset = presets.find(
            (preset) => preset.category === toolCategory
          );
          if (matchingPreset?.description) {
            setCategoryDescription(matchingPreset.description);
            return;
          }
        }
        // If no description is found, clear it.
        setCategoryDescription("");
      } catch (error) {
        console.error("Failed to load category description:", error);
        setCategoryDescription("Error loading description.");
      }
    };

    loadCategoryDescription();
  }, [currentChat?.config, systemPromptService]);

  // Content to display: prioritize category description, then fallback
  const promptToDisplay = React.useMemo(() => {
    if (categoryDescription) {
      return categoryDescription;
    }
    // The actual system prompt is now stored in the messages array.
    // This component should primarily show the description or a placeholder.
    const systemMessage = currentChat?.messages.find(
      (m) => m.role === "system"
    );
    if (systemMessage) {
      return systemMessage.content;
    }

    return "System prompt is being prepared...";
  }, [categoryDescription, currentChat?.messages]);

  // If there's no active chat, don't render anything.
  if (!currentChat) {
    return null;
  }

  return (
    <Card
      style={{
        position: "relative",
        width: "100%",
        maxWidth: "100%",
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadow,
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
                  <ol style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
                    {children}
                  </ol>
                ),
                ul: ({ children }) => (
                  <ul style={{ marginBottom: token.marginSM, paddingLeft: 20 }}>
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
          </div>
        </div>
      </Space>
    </Card>
  );
};

export default SystemMessage;
