import React, { useEffect, useState, memo } from "react";
import { Card, Flex, Space, Typography, theme } from "antd";
import { streamingMessageBus } from "../../utils/streamingMessageBus";

const { Text } = Typography;
const { useToken } = theme;

interface StreamingMessageCardProps {
  chatId: string;
}

const StreamingMessageCard: React.FC<StreamingMessageCardProps> = memo(
  ({ chatId }) => {
    const { token } = useToken();
    const messageId = `streaming-${chatId}`;
    const [content, setContent] = useState<string>(
      () => streamingMessageBus.getLatest(messageId) ?? ""
    );

    useEffect(() => {
      return streamingMessageBus.subscribeMessage(messageId, (next) => {
        setContent(next ?? "");
      });
    }, [messageId]);

    return (
      <Card
        style={{
          width: "100%",
          minWidth: "100%",
          maxWidth: "800px",
          margin: "0 auto",
          background: token.colorBgLayout,
          borderRadius: token.borderRadiusLG,
          boxShadow: token.boxShadow,
          position: "relative",
          wordWrap: "break-word",
          overflowWrap: "break-word",
        }}
      >
        <Space
          direction="vertical"
          size={token.marginXS}
          style={{ width: "100%", maxWidth: "100%" }}
        >
          <Flex align="baseline" justify="space-between" gap={token.marginXS}>
            <Text type="secondary" strong style={{ fontSize: token.fontSizeSM }}>
              Assistant
            </Text>
          </Flex>
          <Flex vertical style={{ width: "100%", maxWidth: "100%" }}>
            {!content ? (
              <Text italic>Assistant is thinking...</Text>
            ) : (
              <Text style={{ whiteSpace: "pre-wrap" }}>{content}</Text>
            )}
            <span
              className="blinking-cursor"
              style={{
                display: "inline-block",
                marginLeft: "0.2em",
                color: token.colorText,
              }}
            />
          </Flex>
        </Space>
      </Card>
    );
  }
);

StreamingMessageCard.displayName = "StreamingMessageCard";

export default StreamingMessageCard;
