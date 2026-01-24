import React from "react";
import { Flex, Typography } from "antd";

const { Text } = Typography;

interface MessageCardHeaderProps {
  role: "user" | "assistant" | "system" | "tool";
  formattedTimestamp?: string | null;
  token: any;
}

const MessageCardHeader: React.FC<MessageCardHeaderProps> = ({
  role,
  formattedTimestamp,
  token,
}) => {
  return (
    <Flex align="baseline" justify="space-between" gap={token.marginXS}>
      <Text type="secondary" strong style={{ fontSize: token.fontSizeSM }}>
        {role === "user" ? "You" : role === "assistant" ? "Assistant" : role}
      </Text>
      {formattedTimestamp && (
        <Text
          type="secondary"
          style={{
            fontSize: token.fontSizeSM,
            whiteSpace: "nowrap",
          }}
        >
          {formattedTimestamp}
        </Text>
      )}
    </Flex>
  );
};

export default MessageCardHeader;
