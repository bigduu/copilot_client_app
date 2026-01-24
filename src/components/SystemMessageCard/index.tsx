import React, { useCallback } from "react";
import { Button, Card, Collapse, Flex, Space, Typography, theme } from "antd";
import { CopyOutlined, EyeOutlined } from "@ant-design/icons";

import { useChatManager } from "../../hooks/useChatManager";
import type { Message } from "../../types/chat";
import { useAppStore } from "../../store";
import { SystemPromptMarkdown } from "./SystemPromptMarkdown";
import { useSystemPromptContent } from "./useSystemPromptContent";

const { Text } = Typography;
const { useToken } = theme;

interface SystemMessageCardProps {
  message: Message;
}

const SystemMessageCard: React.FC<SystemMessageCardProps> = ({ message }) => {
  const { token } = useToken();
  const { currentChat } = useChatManager();
  const systemPrompts = useAppStore((state) => state.systemPrompts);

  const {
    basePrompt,
    categoryDescription,
    enhancedPrompt,
    loadingEnhanced,
    loadEnhancedPrompt,
    promptToDisplay,
    showEnhanced,
    setShowEnhanced,
    systemMessageContent,
  } = useSystemPromptContent({ currentChat, message, systemPrompts });

  const copyToClipboard = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy text:", e);
    }
  }, []);

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
        <Flex justify="space-between" align="center">
          <Flex align="center" gap={token.marginXS}>
            <Text
              type="secondary"
              strong
              style={{ fontSize: token.fontSizeSM }}
            >
              System Prompt
            </Text>
          </Flex>
          <Space>
            {basePrompt && !showEnhanced ? (
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={loadEnhancedPrompt}
                loading={loadingEnhanced}
              >
                View Enhanced
              </Button>
            ) : null}
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => copyToClipboard(promptToDisplay)}
            >
              Copy
            </Button>
          </Space>
        </Flex>

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
                <Flex
                  vertical
                  style={{
                    maxHeight: "300px",
                    overflowY: "auto",
                    paddingRight: token.paddingXS,
                  }}
                >
                  <SystemPromptMarkdown
                    content={
                      basePrompt || categoryDescription || systemMessageContent
                    }
                    token={token}
                  />
                </Flex>
              ),
            },
            ...(basePrompt
              ? [
                  {
                    key: "enhanced",
                    label: "Enhanced Prompt",
                    children: enhancedPrompt ? (
                      <Flex
                        vertical
                        style={{
                          maxHeight: "400px",
                          overflowY: "auto",
                          paddingRight: token.paddingXS,
                        }}
                      >
                        <SystemPromptMarkdown
                          content={enhancedPrompt}
                          token={token}
                          headingColor={token.colorPrimary}
                        />
                      </Flex>
                    ) : (
                      <Text type="secondary">Loading enhanced prompt...</Text>
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
