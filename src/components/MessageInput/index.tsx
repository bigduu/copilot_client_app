import React, { useRef, useState, useCallback, useEffect } from "react";
import { Button, Space, theme, message, Typography } from "antd";
import {
  SendOutlined,
  SyncOutlined,
  PictureOutlined,
  CloseOutlined,
  StopOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
import {
  ImageFile,
  processImageFiles,
  hasImageFiles,
  extractImageFiles,
  cleanupImagePreviews,
} from "../../utils/imageUtils";
import ImagePreviewModal from "../ImagePreviewModal";

import { Input } from "antd";

const { TextArea } = Input;
import { ToolService } from "../../services/ToolService";

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string, images?: ImageFile[]) => void;
  onRetry?: () => void;
  onCancel?: () => void;
  isStreaming: boolean;
  isCenteredLayout?: boolean;
  placeholder?: string;
  disabled?: boolean;
  showRetryButton?: boolean;
  hasMessages?: boolean;
  images?: ImageFile[];
  onImagesChange?: (images: ImageFile[]) => void;
  allowImages?: boolean;
  isToolSelectorVisible?: boolean; // Prevent Enter key handling when tool selector is open
  validateMessage?: (message: string) => {
    isValid: boolean;
    errorMessage?: string;
  };
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  onRetry,
  onCancel,
  isStreaming,
  // isCenteredLayout = false,
  placeholder = "Send a message...",
  disabled = false,
  showRetryButton = true,
  hasMessages = false,
  images = [],
  onImagesChange,
  allowImages = true,
  isToolSelectorVisible = false,
  validateMessage,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const [isDragOver, setIsDragOver] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [availableTools, setAvailableTools] = useState<string[]>([]);
  const toolService = ToolService.getInstance();

  // Image handling functions
  const handleImageFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!allowImages || !onImagesChange) return;

      try {
        const processedImages = await processImageFiles(files);
        if (processedImages.length > 0) {
          const newImages = [...images, ...processedImages];
          onImagesChange(newImages);
          messageApi.success(`Added ${processedImages.length} image(s)`);
        }
      } catch (error) {
        messageApi.error(`Failed to process images: ${error}`);
      }
    },
    [allowImages, images, onImagesChange, messageApi]
  );

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      if (!onImagesChange) return;

      const imageToRemove = images.find((img) => img.id === imageId);
      if (imageToRemove) {
        cleanupImagePreviews([imageToRemove]);
      }

      const newImages = images.filter((img) => img.id !== imageId);
      onImagesChange(newImages);
    },
    [images, onImagesChange]
  );

  const handleImagePreview = useCallback(
    (image: ImageFile) => {
      const index = images.findIndex((img) => img.id === image.id);
      setPreviewImageIndex(index >= 0 ? index : 0);
      setPreviewModalVisible(true);
    },
    [images]
  );

  // Drag and drop handlers
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (allowImages && hasImageFiles(e.dataTransfer)) {
        setIsDragOver(true);
      }
    },
    [allowImages]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!allowImages) return;

      const imageFiles = extractImageFiles(e.dataTransfer);
      if (imageFiles.length > 0) {
        handleImageFiles(imageFiles);
      }
    },
    [allowImages, handleImageFiles]
  );

  // Paste handler
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!allowImages || !e.clipboardData) return;

      const items = Array.from(e.clipboardData.items);
      const imageFiles: File[] = [];

      items.forEach((item) => {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      });

      if (imageFiles.length > 0) {
        e.preventDefault();
        handleImageFiles(imageFiles);
      }
    },
    [allowImages, handleImageFiles]
  );

  // Fetch available tools on component mount
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const tools = await toolService.getAvailableTools();
        setAvailableTools(tools.map((tool) => tool.name));
      } catch (error) {
        console.error("Failed to fetch available tools:", error);
      }
    };

    fetchTools();
  }, [toolService]);

  // Helper function to check if a string is a valid tool name
  const isValidToolName = useCallback(
    (toolName: string): boolean => {
      return availableTools.includes(toolName);
    },
    [availableTools]
  );

  // Helper function to find tool names in text
  const findToolMatches = useCallback(
    (text: string) => {
      const toolMatches: Array<{
        start: number;
        end: number;
        toolName: string;
      }> = [];
      const regex = /\/(\w+)/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        const toolName = match[1];
        if (isValidToolName(toolName)) {
          toolMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            toolName: toolName,
          });
        }
      }

      return toolMatches;
    },
    [isValidToolName]
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle smart deletion for tool names
    if (
      event.key === "Backspace" &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    ) {
      const textarea = event.currentTarget;
      const cursorPosition = textarea.selectionStart;
      const text = textarea.value;

      // Find all tool names in the text
      const toolMatches = findToolMatches(text);

      // Check if cursor is at the end of a tool name
      for (const match of toolMatches) {
        if (cursorPosition === match.end) {
          // Cursor is at the end of a tool name, delete the entire tool name
          event.preventDefault();
          const newText =
            text.substring(0, match.start) + text.substring(match.end);
          onChange(newText);

          // Set cursor position after deletion
          setTimeout(() => {
            textarea.setSelectionRange(match.start, match.start);
          }, 0);

          return;
        }
      }
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isStreaming &&
      !disabled &&
      !isToolSelectorVisible
    ) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmedContent = value.trim();
    if ((!trimmedContent && images.length === 0) || isStreaming || disabled)
      return;

    // If validation function is provided, validate first
    if (validateMessage) {
      const validation = validateMessage(trimmedContent);

      if (!validation.isValid) {
        // Show error message
        messageApi.error(
          validation.errorMessage || "Message format is incorrect"
        );
        return;
      }
    }

    onSubmit(trimmedContent, images.length > 0 ? images : undefined);
  };

  const handleRetry = () => {
    if (isStreaming || disabled || !onRetry) return;
    onRetry();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleImageFiles(files);
    }
    // Reset input value to allow selecting the same file again
    e.target.value = "";
  };

  return (
    <>
      {/* Ant Design message context holder */}
      {contextHolder}

      {/* Input Container with Drag & Drop */}
      <div
        style={{
          position: "relative",
          border: isDragOver ? `2px dashed ${token.colorPrimary}` : "none",
          borderRadius: token.borderRadius,
          backgroundColor: isDragOver ? token.colorPrimaryBg : "transparent",
          transition: "all 0.2s ease",
          width: "100%",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Compact Image Preview - shown above input when images exist */}
        {allowImages && images.length > 0 && (
          <div
            style={{
              marginBottom: token.marginXS,
              padding: token.paddingXS,
              backgroundColor: token.colorFillQuaternary,
              borderRadius: token.borderRadiusSM,
              border: `1px solid ${token.colorBorder}`,
            }}
          >
            <div
              style={{
                display: "flex",
                gap: token.marginXS,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Text
                type="secondary"
                style={{ fontSize: token.fontSizeSM, minWidth: "fit-content" }}
              >
                {images.length} image{images.length > 1 ? "s" : ""}:
              </Text>
              {images.slice(0, 3).map((image) => (
                <div
                  key={image.id}
                  style={{
                    position: "relative",
                    width: 32,
                    height: 32,
                    borderRadius: token.borderRadiusSM,
                    overflow: "hidden",
                    border: `1px solid ${token.colorBorder}`,
                    cursor: "pointer",
                  }}
                  onClick={() => handleImagePreview(image)}
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
              {images.length > 3 && (
                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  +{images.length - 3} more
                </Text>
              )}
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => {
                  images.forEach((img) => handleRemoveImage(img.id));
                }}
                style={{
                  marginLeft: "auto",
                  minWidth: "auto",
                  padding: "0 4px",
                  height: 20,
                }}
                title="Clear all images"
              />
            </div>
          </div>
        )}
        {isDragOver && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${token.colorPrimary}10`,
              borderRadius: token.borderRadius,
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <Space direction="vertical" align="center">
              <PictureOutlined
                style={{ fontSize: 32, color: token.colorPrimary }}
              />
              <Text style={{ color: token.colorPrimary, fontWeight: 500 }}>
                Drop images here
              </Text>
            </Space>
          </div>
        )}

        {/* Input with integrated buttons */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: token.marginXS,
            backgroundColor: token.colorBgContainer,
            border: `1px solid ${token.colorBorder}`,
            borderRadius: token.borderRadius,
            padding: `${token.paddingXS}px ${token.paddingSM}px`,
            transition: "border-color 0.2s",
            minHeight: 60,
            flex: 1,
            width: "100%",
          }}
        >
          {/* Left side buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "center",
              gap: token.marginXS,
            }}
          >
            {/* Image Upload Button */}
            {allowImages && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: "none" }}
                  onChange={handleFileInputChange}
                />
                <Button
                  type="text"
                  icon={<PictureOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={disabled || isStreaming}
                  size="small"
                  style={{
                    minWidth: "auto",
                    padding: "4px",
                    height: 32,
                    width: 32,
                    color: token.colorTextSecondary,
                  }}
                  title="Add images"
                />
              </>
            )}
          </div>

          {/* Text input */}
          <TextArea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={isStreaming}
            autoSize={{ minRows: 2, maxRows: 6 }}
            variant="borderless"
            style={{
              resize: "none",
              flex: 1,
              fontSize: token.fontSize,
              padding: "8px 0",
              minHeight: "100%",
              height: "100%",
              lineHeight: "1.5",
              border: "none",
              outline: "none",
              // Keep clean appearance - visual feedback removed for better UX
            }}
          />

          {/* Right side buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "center",
              gap: token.marginXS,
            }}
          >
            {showRetryButton && hasMessages && (
              <Button
                type="text"
                icon={<SyncOutlined spin={isStreaming} />}
                onClick={handleRetry}
                disabled={isStreaming || disabled || !onRetry}
                title="Regenerate last AI response"
                size="small"
                style={{
                  minWidth: "auto",
                  padding: "4px",
                  height: 32,
                  width: 32,
                  color: token.colorTextSecondary,
                }}
              />
            )}

            <Button
              type="primary"
              icon={isStreaming ? <StopOutlined /> : <SendOutlined />}
              onClick={isStreaming ? onCancel : handleSubmit}
              disabled={
                isStreaming
                  ? !onCancel || disabled
                  : (!value.trim() && images.length === 0) || disabled
              }
              size="small"
              danger={isStreaming}
              style={{
                minWidth: "auto",
                padding: "4px 6px",
                height: 32,
                width: 40,
              }}
              title={isStreaming ? "Cancel request" : "Send message"}
            />
          </div>
        </div>
      </div>

      {/* Image Preview Modal */}
      {allowImages && (
        <ImagePreviewModal
          visible={previewModalVisible}
          images={images}
          currentIndex={previewImageIndex}
          onClose={() => setPreviewModalVisible(false)}
        />
      )}
    </>
  );
};
