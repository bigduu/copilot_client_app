import React, { useState } from "react";
import { Modal, Button, Space, Typography, theme, Carousel } from "antd";
import {
  LeftOutlined,
  RightOutlined,
  DownloadOutlined,
  CloseOutlined,
} from "@ant-design/icons";
import { ImageFile, formatFileSize } from "../../utils/imageUtils";

const { Text, Title } = Typography;

interface ImagePreviewModalProps {
  visible: boolean;
  images: ImageFile[];
  currentIndex?: number;
  onClose: () => void;
  onDownload?: (image: ImageFile) => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  visible,
  images,
  currentIndex = 0,
  onClose,
  onDownload,
}) => {
  const { token } = theme.useToken();
  const [activeIndex, setActiveIndex] = useState(currentIndex);

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[activeIndex];

  const handleDownload = () => {
    if (onDownload && currentImage) {
      onDownload(currentImage);
    } else {
      // Default download behavior
      const link = document.createElement("a");
      link.href = currentImage.base64;
      link.download = currentImage.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const goToPrevious = () => {
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const goToNext = () => {
    setActiveIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width="90vw"
      style={{ top: 20 }}
      styles={{
        body: {
          padding: 0,
          height: "80vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
      closeIcon={<CloseOutlined style={{ color: token.colorTextLightSolid }} />}
    >
      {/* Header */}
      <div
        style={{
          padding: token.paddingMD,
          borderBottom: `1px solid ${token.colorBorder}`,
          background: token.colorBgContainer,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {currentImage.name}
            </Title>
            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {formatFileSize(currentImage.size)} • {currentImage.type}
              {images.length > 1 && ` • ${activeIndex + 1} of ${images.length}`}
            </Text>
          </div>

          <Space>
            {images.length > 1 && (
              <>
                <Button
                  icon={<LeftOutlined />}
                  onClick={goToPrevious}
                  disabled={images.length <= 1}
                />
                <Button
                  icon={<RightOutlined />}
                  onClick={goToNext}
                  disabled={images.length <= 1}
                />
              </>
            )}
            <Button icon={<DownloadOutlined />} onClick={handleDownload}>
              Download
            </Button>
          </Space>
        </div>
      </div>

      {/* Image Display */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: token.colorBgLayout,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {images.length === 1 ? (
          <img
            src={currentImage.preview}
            alt={currentImage.name}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
          />
        ) : (
          <Carousel
            dots={false}
            arrows
            infinite
            afterChange={setActiveIndex}
            style={{ width: "100%", height: "100%" }}
          >
            {images.map((image) => (
              <div key={image.id}>
                <div
                  style={{
                    height: "70vh",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <img
                    src={image.preview}
                    alt={image.name}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              </div>
            ))}
          </Carousel>
        )}

        {/* Navigation arrows for multiple images */}
        {images.length > 1 && (
          <>
            <Button
              type="primary"
              shape="circle"
              icon={<LeftOutlined />}
              onClick={goToPrevious}
              style={{
                position: "absolute",
                left: 20,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
            />
            <Button
              type="primary"
              shape="circle"
              icon={<RightOutlined />}
              onClick={goToNext}
              style={{
                position: "absolute",
                right: 20,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
            />
          </>
        )}
      </div>

      {/* Thumbnail strip for multiple images */}
      {images.length > 1 && (
        <div
          style={{
            padding: token.paddingSM,
            borderTop: `1px solid ${token.colorBorder}`,
            background: token.colorBgContainer,
            display: "flex",
            gap: token.marginXS,
            overflowX: "auto",
            maxHeight: 80,
          }}
        >
          {images.map((image, index) => (
            <div
              key={image.id}
              style={{
                minWidth: 60,
                height: 60,
                border:
                  index === activeIndex
                    ? `2px solid ${token.colorPrimary}`
                    : `1px solid ${token.colorBorder}`,
                borderRadius: token.borderRadius,
                overflow: "hidden",
                cursor: "pointer",
                opacity: index === activeIndex ? 1 : 0.7,
              }}
              onClick={() => setActiveIndex(index)}
            >
              <img
                src={image.preview}
                alt={image.name}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default ImagePreviewModal;
