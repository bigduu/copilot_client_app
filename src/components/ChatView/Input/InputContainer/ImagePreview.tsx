import React from "react";
import { Card, Button, Image, Space, Typography, theme } from "antd";
import { CloseOutlined, FileImageOutlined } from "@ant-design/icons";

const { Text } = Typography;
const { useToken } = theme;

interface ImagePreviewProps {
  imageUrl: string;
  fileName: string;
  onRemove: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  imageUrl,
  fileName,
  onRemove,
}) => {
  const { token } = useToken();

  return (
    <Card
      size="small"
      style={{
        marginBottom: token.marginSM,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
      }}
      bodyStyle={{ padding: token.paddingSM }}
    >
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Space size="small">
            <FileImageOutlined style={{ color: token.colorPrimary }} />
            <Text
              ellipsis
              style={{
                maxWidth: 200,
                fontSize: token.fontSizeSM,
                color: token.colorTextSecondary,
              }}
            >
              {fileName}
            </Text>
          </Space>
          <Button
            type="text"
            icon={<CloseOutlined />}
            onClick={onRemove}
            size="small"
            style={{
              color: token.colorTextTertiary,
              padding: 0,
              minWidth: "auto",
            }}
            aria-label="Remove image"
          />
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: token.paddingXS,
            backgroundColor: token.colorFillQuaternary,
            borderRadius: token.borderRadiusSM,
          }}
        >
          <Image
            src={imageUrl}
            alt={fileName}
            style={{
              maxWidth: 150,
              maxHeight: 100,
              objectFit: "contain",
            }}
            preview={{
              mask: <div style={{ fontSize: token.fontSizeSM }}>点击预览</div>,
            }}
          />
        </div>
      </Space>
    </Card>
  );
};
