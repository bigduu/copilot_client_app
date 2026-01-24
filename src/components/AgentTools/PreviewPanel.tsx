import React, { useState } from "react";
import { Button, Flex, Input, Typography, theme, Card } from "antd";

const { Text } = Typography;

export const PreviewPanel: React.FC = () => {
  const { token } = theme.useToken();
  const [url, setUrl] = useState("");
  const [activeUrl, setActiveUrl] = useState("");

  return (
    <Flex vertical style={{ gap: token.marginSM, height: "100%" }}>
      <Flex style={{ gap: 8 }}>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter URL to preview"
        />
        <Button onClick={() => setActiveUrl(url.trim())}>Preview</Button>
      </Flex>
      {activeUrl ? (
        <Card
          size="small"
          styles={{ body: { padding: 0 } }}
          style={{ flex: 1, overflow: "hidden" }}
        >
          <iframe
            src={activeUrl}
            style={{
              width: "100%",
              height: "100%",
              border: "1px solid",
              borderColor: token.colorBorderSecondary,
            }}
            title="preview"
          />
        </Card>
      ) : (
        <Text type="secondary">Enter a URL to open a live preview.</Text>
      )}
    </Flex>
  );
};
