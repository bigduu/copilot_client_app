import React from "react";
import { Card, Typography, Space, Button, theme } from "antd";
import { CloseOutlined } from "@ant-design/icons";

const { Text } = Typography;
const { useToken } = theme;

interface InputPreviewProps {
  text: string;
  onClose: () => void;
}

const InputPreview: React.FC<InputPreviewProps> = ({ text, onClose }) => {
  const { token } = useToken();

  // Limit text length for preview
  const displayText = text.length > 150 ? text.substring(0, 147) + "..." : text;

  // Remove the quote prefix from each line for display
  const cleanDisplayText = displayText.replace(/^> |^>/gm, "");

  return (
    <Card
      size="small"
      style={{
        marginBottom: token.marginXS,
        background: token.colorBgElevated,
        borderRadius: token.borderRadiusSM,
        boxShadow: token.boxShadowSecondary,
        border: `1px solid ${token.colorPrimaryBorderHover}`,
      }}
      bodyStyle={{ padding: `${token.paddingXS}px ${token.paddingSM}px` }}
    >
      <Space
        style={{
          width: "100%",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1 }}>
          <Text
            strong
            style={{ fontSize: token.fontSizeSM, color: token.colorPrimary }}
          >
            Referencing:
          </Text>
          <div
            style={{
              fontSize: token.fontSizeSM,
              color: token.colorText,
              borderLeft: `3px solid ${token.colorPrimary}`,
              paddingLeft: token.paddingSM,
              marginTop: token.marginXXS,
              marginBottom: token.marginXXS,
              paddingTop: token.paddingXXS,
              paddingBottom: token.paddingXXS,
              background: `linear-gradient(to right, ${token.colorPrimaryBg}10, transparent)`,
              borderRadius: `0 ${token.borderRadiusSM}px ${token.borderRadiusSM}px 0`,
            }}
          >
            {cleanDisplayText}
          </div>
        </div>
        <Button
          type="text"
          size="small"
          icon={<CloseOutlined />}
          onClick={onClose}
          style={{
            marginLeft: token.marginXS,
            color: token.colorTextSecondary,
            marginTop: -token.marginXXS,
          }}
        />
      </Space>
    </Card>
  );
};

export default InputPreview;
