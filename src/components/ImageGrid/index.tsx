import React from "react";
import { Image, theme } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import { MessageImage } from "../../types/chat";

const { useToken } = theme;

export interface ImageGridProps {
  images: MessageImage[];
  className?: string;
  style?: React.CSSProperties;
  maxHeight?: {
    single?: number;
    multiple?: number;
  };
}

export const ImageGrid: React.FC<ImageGridProps> = ({
  images,
  className,
  style,
  maxHeight = { single: 400, multiple: 200 },
}) => {
  const { token } = useToken();

  if (!images || images.length === 0) {
    return null;
  }

  return (
    <div 
      className={className}
      style={{ 
        marginBottom: token.marginMD,
        ...style 
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            images.length === 1
              ? "1fr"
              : images.length === 2
              ? "1fr 1fr"
              : "repeat(auto-fit, minmax(200px, 1fr))",
          gap: token.marginSM,
          maxWidth: "100%",
        }}
      >
        {images.map((image) => (
          <div
            key={image.id}
            style={{
              position: "relative",
              borderRadius: token.borderRadius,
              overflow: "hidden",
              backgroundColor: token.colorBgLayout,
              border: `1px solid ${token.colorBorder}`,
            }}
          >
            <Image
              src={image.base64}
              alt={image.name}
              style={{
                width: "100%",
                height: "auto",
                maxHeight: images.length === 1 ? maxHeight.single : maxHeight.multiple,
                objectFit: "cover",
              }}
              preview={{
                mask: (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: token.marginXS,
                      color: token.colorTextLightSolid,
                    }}
                  >
                    <EyeOutlined />
                    <span>Preview</span>
                  </div>
                ),
              }}
            />
            {/* Image info overlay */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background:
                  "linear-gradient(transparent, rgba(0,0,0,0.7))",
                color: token.colorTextLightSolid,
                padding: `${token.paddingXS}px ${token.paddingSM}px`,
                fontSize: token.fontSizeSM,
              }}
            >
              <div style={{ fontWeight: 500 }}>{image.name}</div>
              {image.size && (
                <div
                  style={{
                    fontSize: token.fontSizeSM * 0.85,
                    opacity: 0.8,
                  }}
                >
                  {(image.size / 1024).toFixed(1)} KB
                  {image.width &&
                    image.height &&
                    ` • ${image.width}×${image.height}`}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ImageGrid;
