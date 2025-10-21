import React, { useState, useEffect } from "react";
import { Card, Space, Typography, theme } from "antd";
import ReactMarkdown from "react-markdown";
import { useChatManager } from "../../hooks/useChatManager";
import { SystemPromptService } from "../../services/SystemPromptService";
import { Message } from "../../types/chat";

const { Text } = Typography;
const { useToken } = theme;

interface SystemMessageCardProps {
  message: Message;
}

const SystemMessageCard: React.FC<SystemMessageCardProps> = ({ message }) => {
  const { token } = useToken();
  const { currentChat } = useChatManager();
  const [categoryDescription, setCategoryDescription] = useState<string>("");

  const systemPromptService = React.useMemo(
    () => SystemPromptService.getInstance(),
    []
  );

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
        setCategoryDescription("");
      } catch (error) {
        console.error("Failed to load category description:", error);
        setCategoryDescription("Error loading description.");
      }
    };

    loadCategoryDescription();
  }, [currentChat?.config, systemPromptService]);

  const promptToDisplay = React.useMemo(() => {
    if (categoryDescription) {
      return categoryDescription;
    }
    if (message.role === "system") {
      return message.content;
    }
    return "System prompt is being prepared...";
  }, [categoryDescription, message]);

  return (
    <Card
      style={{
        width: "100%",
        maxWidth: "100%",
        background: token.colorBgContainer,
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
            maxHeight: "200px", // Limit height
            overflowY: "auto", // Add scrollbar
            paddingRight: token.paddingXS, // Add some padding for the scrollbar
          }}
        >
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
      </Space>
    </Card>
  );
};

export default SystemMessageCard;
