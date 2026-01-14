import React, { useState, useEffect, useMemo } from "react";
import { Card, Space, Typography, theme, Collapse, Button } from "antd";
import { EyeOutlined, CopyOutlined } from "@ant-design/icons";
import ReactMarkdown from "react-markdown";
import { useChatManager } from "../../hooks/useChatManager";
import { SystemPromptService } from "../../services/SystemPromptService";
import { Message } from "../../types/chat";
import { useAppStore } from "../../store";
import {
  buildEnhancedSystemPrompt,
  getSystemPromptEnhancementText,
} from "../../utils/systemPromptEnhancement";

const { Text, Paragraph } = Typography;
const { useToken } = theme;

interface SystemMessageCardProps {
  message: Message;
}

const SystemMessageCard: React.FC<SystemMessageCardProps> = ({ message }) => {
  const { token } = useToken();
  const { currentChat } = useChatManager();
  const systemPrompts = useAppStore((state) => state.systemPrompts);
  const [categoryDescription, setCategoryDescription] = useState<string>("");
  const [basePrompt, setBasePrompt] = useState<string>("");
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [loadingEnhanced, setLoadingEnhanced] = useState(false);
  const [showEnhanced, setShowEnhanced] = useState(false);

  const systemPromptService = React.useMemo(
    () => SystemPromptService.getInstance(),
    []
  );
  const systemMessageContent =
    message.role === "system" && typeof message.content === "string"
      ? message.content
      : "";

  // Monitor system message changes
  useEffect(() => {
    if (message.role === "system") {
      console.log(
        "[SystemMessageCard] ========== SYSTEM MESSAGE CHANGED =========="
      );
      console.log("[SystemMessageCard] Message ID:", message.id);
      console.log(
        "[SystemMessageCard] Message content length:",
        systemMessageContent.length
      );
      console.log("[SystemMessageCard] Message timestamp:", message.createdAt);
      console.log(
        "[SystemMessageCard] ============================================="
      );

      // Reset enhanced prompt when system message changes
      setEnhancedPrompt(null);
      setShowEnhanced(false);
    }
  }, [message.id, message.role, systemMessageContent, message.createdAt]);

  // Load base prompt content
  useEffect(() => {
    const loadBasePrompt = async () => {
      if (!currentChat?.config) {
        return;
      }

      try {
        const { systemPromptId } = currentChat.config;

        // 1. First, try to find the content in the user-defined prompts from Zustand
        if (systemPromptId) {
          const userPrompt = systemPrompts.find((p) => p.id === systemPromptId);
          if (userPrompt?.content) {
            setBasePrompt(userPrompt.content);
            return;
          }
          if (userPrompt?.description) {
            setCategoryDescription(userPrompt.description);
          }
        }

        // 2. If not found, try the original logic with the service
        if (systemPromptId) {
          const preset =
            await systemPromptService.findPresetById(systemPromptId);
          if (preset?.content) {
            setBasePrompt(preset.content);
            return;
          }
          if (preset?.description) {
            setCategoryDescription(preset.description);
          }
        }

      } catch (error) {
        console.error("Failed to load base prompt:", error);
      }
    };

    loadBasePrompt();
  }, [currentChat?.config, systemPromptService, systemPrompts]);

  // Load enhanced prompt when requested
  const loadEnhancedPrompt = async () => {
    if (!basePrompt || loadingEnhanced) return;

    setLoadingEnhanced(true);
    try {
      const enhancementText = getSystemPromptEnhancementText();
      const enhanced = buildEnhancedSystemPrompt(basePrompt, enhancementText);

      setEnhancedPrompt(enhanced);
      setShowEnhanced(true);
    } catch (error) {
      console.error("Failed to load enhanced prompt:", error);
    } finally {
      setLoadingEnhanced(false);
    }
  };

  const promptToDisplay = useMemo(() => {
    if (showEnhanced && enhancedPrompt) {
      return enhancedPrompt;
    }
    if (basePrompt) {
      return basePrompt;
    }
    if (categoryDescription) {
      return categoryDescription;
    }
    if (message.role === "system") {
      return systemMessageContent;
    }
    return "System prompt is being prepared...";
  }, [showEnhanced, enhancedPrompt, basePrompt, categoryDescription, message]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  };

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
        size={token.marginSM}
        style={{ width: "100%" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: token.marginXS,
            }}
          >
            <Text
              type="secondary"
              strong
              style={{ fontSize: token.fontSizeSM }}
            >
              System Prompt
            </Text>
          </div>
          <Space>
            {basePrompt && !showEnhanced && (
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={loadEnhancedPrompt}
                loading={loadingEnhanced}
              >
                View Enhanced
              </Button>
            )}
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(promptToDisplay)}
            >
              Copy
            </Button>
          </Space>
        </div>

        <Collapse
          ghost
          activeKey={showEnhanced ? ["enhanced"] : ["base"]}
          onChange={(keys) => {
            if (keys.includes("enhanced")) {
              loadEnhancedPrompt();
            } else {
              setShowEnhanced(false);
            }
          }}
          items={[
            {
              key: "base",
              label: basePrompt ? "Base Prompt" : "Description",
              children: (
                <div
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    paddingRight: token.paddingXS,
                  }}
                >
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => (
                        <Paragraph style={{ marginBottom: token.marginSM }}>
                          {children}
                        </Paragraph>
                      ),
                      ol: ({ children }) => (
                        <ol
                          style={{
                            marginBottom: token.marginSM,
                            paddingLeft: 20,
                          }}
                        >
                          {children}
                        </ol>
                      ),
                      ul: ({ children }) => (
                        <ul
                          style={{
                            marginBottom: token.marginSM,
                            paddingLeft: 20,
                          }}
                        >
                          {children}
                        </ul>
                      ),
                      li: ({ children }) => (
                        <li style={{ marginBottom: token.marginXS }}>
                          {children}
                        </li>
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
                    {basePrompt || categoryDescription || systemMessageContent}
                  </ReactMarkdown>
                </div>
              ),
            },
            ...(basePrompt
              ? [
                  {
                    key: "enhanced",
                    label: "Enhanced Prompt",
                    children: enhancedPrompt ? (
                      <div
                        style={{
                          maxHeight: "400px",
                          overflowY: "auto",
                          paddingRight: token.paddingXS,
                        }}
                      >
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => (
                              <Paragraph
                                style={{ marginBottom: token.marginSM }}
                              >
                                {children}
                              </Paragraph>
                            ),
                            ol: ({ children }) => (
                              <ol
                                style={{
                                  marginBottom: token.marginSM,
                                  paddingLeft: 20,
                                }}
                              >
                                {children}
                              </ol>
                            ),
                            ul: ({ children }) => (
                              <ul
                                style={{
                                  marginBottom: token.marginSM,
                                  paddingLeft: 20,
                                }}
                              >
                                {children}
                              </ul>
                            ),
                            li: ({ children }) => (
                              <li style={{ marginBottom: token.marginXS }}>
                                {children}
                              </li>
                            ),
                            h1: ({ children }) => (
                              <Text
                                strong
                                style={{
                                  fontSize: token.fontSizeHeading3,
                                  marginBottom: token.marginSM,
                                  display: "block",
                                  color: token.colorPrimary,
                                }}
                              >
                                {children}
                              </Text>
                            ),
                            h2: ({ children }) => (
                              <Text
                                strong
                                style={{
                                  fontSize: token.fontSizeHeading4,
                                  marginBottom: token.marginSM,
                                  display: "block",
                                }}
                              >
                                {children}
                              </Text>
                            ),
                          }}
                        >
                          {enhancedPrompt}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <div>Loading enhanced prompt...</div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Space>
    </Card>
  );
};

export default SystemMessageCard;
