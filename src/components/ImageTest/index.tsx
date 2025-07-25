import React, { useState } from "react";
import { Button, Space, Typography, Card, message } from "antd";
import { PictureOutlined } from "@ant-design/icons";
import { ImageFile, processImageFiles } from "../../utils/imageUtils";
import ImagePreview from "../ImagePreview";
import ImagePreviewModal from "../ImagePreviewModal";

const { Title, Text } = Typography;

/**
 * Test component for image functionality
 * This can be used to test image upload, preview, and processing
 */
export const ImageTest: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [messageApi, contextHolder] = message.useMessage();

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
      const processedImages = await processImageFiles(files);
      setImages((prev) => [...prev, ...processedImages]);
      messageApi.success(`Added ${processedImages.length} image(s)`);
    } catch (error) {
      messageApi.error(`Failed to process images: ${error}`);
    }

    // Reset input
    event.target.value = "";
  };

  const handleRemoveImage = (imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    messageApi.info("Image removed");
  };

  const handleImagePreview = (image: ImageFile) => {
    const index = images.findIndex((img) => img.id === image.id);
    setPreviewImageIndex(index >= 0 ? index : 0);
    setPreviewModalVisible(true);
  };

  const handleClearAll = () => {
    setImages([]);
    messageApi.info("All images cleared");
  };

  const handleTestMessage = () => {
    if (images.length === 0) {
      messageApi.warning("Please add some images first");
      return;
    }

    // Simulate message sending with images
    const messageData = {
      content: "Test message with images",
      images: images.map((img) => ({
        id: img.id,
        base64: img.base64,
        name: img.name,
        size: img.size,
        type: img.type,
      })),
    };

    console.log("Test message data:", messageData);
    messageApi.success(`Test message created with ${images.length} image(s)`);
  };

  return (
    <Card
      title="Image Functionality Test"
      style={{ maxWidth: 800, margin: "20px auto" }}
    >
      {contextHolder}

      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <div>
          <Title level={4}>Upload Images</Title>
          <Space>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              style={{ display: "none" }}
              id="image-upload-test"
            />
            <Button
              type="primary"
              icon={<PictureOutlined />}
              onClick={() =>
                document.getElementById("image-upload-test")?.click()
              }
            >
              Select Images
            </Button>
            <Button onClick={handleClearAll} disabled={images.length === 0}>
              Clear All
            </Button>
            <Button
              type="dashed"
              onClick={handleTestMessage}
              disabled={images.length === 0}
            >
              Test Message
            </Button>
          </Space>
        </div>

        <div>
          <Title level={4}>Image Count</Title>
          <Text>
            {images.length} image{images.length !== 1 ? "s" : ""} selected
          </Text>
        </div>

        {images.length > 0 && (
          <div>
            <Title level={4}>Image Preview</Title>
            <ImagePreview
              images={images}
              onRemove={handleRemoveImage}
              onPreview={handleImagePreview}
            />
          </div>
        )}

        <div>
          <Title level={4}>Image Details</Title>
          {images.length === 0 ? (
            <Text type="secondary">No images selected</Text>
          ) : (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              {images.map((image) => (
                <Card key={image.id} size="small">
                  <Space direction="vertical" size="small">
                    <Text strong>{image.name}</Text>
                    <Text type="secondary">
                      Size: {(image.size / 1024).toFixed(1)} KB | Type:{" "}
                      {image.type}
                    </Text>
                    <Text type="secondary">
                      Base64 length: {image.base64.length} characters
                    </Text>
                  </Space>
                </Card>
              ))}
            </Space>
          )}
        </div>
      </Space>

      <ImagePreviewModal
        visible={previewModalVisible}
        images={images}
        currentIndex={previewImageIndex}
        onClose={() => setPreviewModalVisible(false)}
      />
    </Card>
  );
};

export default ImageTest;
