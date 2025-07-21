import React from "react";
import { Card, Button, Space, Typography, theme, Tooltip } from "antd";
import { CloseOutlined, EyeOutlined } from "@ant-design/icons";
import { ImageFile, formatFileSize } from "../../utils/imageUtils";

const { Text } = Typography;

interface ImagePreviewProps {
  images: ImageFile[];
  onRemove: (imageId: string) => void;
  onPreview?: (image: ImageFile) => void;
  maxHeight?: number;
  showFileInfo?: boolean;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({
  images,
  onRemove,
  onPreview,
  maxHeight = 120,
  showFileInfo = true,
}) => {
  const { token } = theme.useToken();

  if (images.length === 0) {
    return null;
  }

  const handlePreview = (image: ImageFile) => {
    if (onPreview) {
      onPreview(image);
    } else {
      // Default preview behavior - open in new window
      const newWindow = window.open();
      if (newWindow) {
        newWindow.document.write(`
          <html>
            <head><title>${image.name}</title></head>
            <body style="margin:0;padding:20px;background:#f0f0f0;display:flex;justify-content:center;align-items:center;min-height:100vh;">
              <img src="${image.preview}" alt="${image.name}" style="max-width:100%;max-height:100%;object-fit:contain;" />
            </body>
          </html>
        `);
      }
    }
  };

  return (
    <div
      style={{
        padding: token.paddingSM,
        background: token.colorBgContainer,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        marginBottom: token.marginSM,
      }}
    >
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        <Text
          type="secondary"
          style={{ fontSize: token.fontSizeSM }}
        >
          {images.length} image{images.length > 1 ? 's' : ''} attached
        </Text>
        
        <div
          style={{
            display: "flex",
            gap: token.marginSM,
            flexWrap: "wrap",
            maxHeight: maxHeight * 2, // Allow for two rows
            overflowY: "auto",
          }}
        >
          {images.map((image) => (
            <Card
              key={image.id}
              size="small"
              style={{
                width: "auto",
                minWidth: 100,
                maxWidth: 200,
              }}
              cover={
                <div
                  style={{
                    position: "relative",
                    height: maxHeight,
                    overflow: "hidden",
                    cursor: "pointer",
                  }}
                  onClick={() => handlePreview(image)}
                >
                  <img
                    src={image.preview}
                    alt={image.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transition: "transform 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.05)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                    }}
                  />
                  
                  {/* Overlay buttons */}
                  <div
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      display: "flex",
                      gap: 4,
                    }}
                  >
                    <Tooltip title="Preview">
                      <Button
                        type="primary"
                        size="small"
                        icon={<EyeOutlined />}
                        style={{
                          minWidth: "auto",
                          padding: "0 4px",
                          height: 24,
                          opacity: 0.9,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreview(image);
                        }}
                      />
                    </Tooltip>
                    
                    <Tooltip title="Remove">
                      <Button
                        danger
                        size="small"
                        icon={<CloseOutlined />}
                        style={{
                          minWidth: "auto",
                          padding: "0 4px",
                          height: 24,
                          opacity: 0.9,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(image.id);
                        }}
                      />
                    </Tooltip>
                  </div>
                </div>
              }
            >
              {showFileInfo && (
                <Card.Meta
                  title={
                    <Tooltip title={image.name}>
                      <Text
                        ellipsis
                        style={{
                          fontSize: token.fontSizeSM,
                          maxWidth: "100%",
                        }}
                      >
                        {image.name}
                      </Text>
                    </Tooltip>
                  }
                  description={
                    <Text
                      type="secondary"
                      style={{ fontSize: token.fontSizeXS }}
                    >
                      {formatFileSize(image.size)}
                    </Text>
                  }
                />
              )}
            </Card>
          ))}
        </div>
      </Space>
    </div>
  );
};

export default ImagePreview;
