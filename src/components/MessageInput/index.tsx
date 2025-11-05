import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import { Button, Space, theme, message, Typography, Spin } from "antd";
import {
  SendOutlined,
  SyncOutlined,
  PictureOutlined,
  CloseOutlined,
  StopOutlined,
} from "@ant-design/icons";

const { Text } = Typography;
import { ImageFile } from "../../utils/imageUtils";
import ImagePreviewModal from "../ImagePreviewModal";
import { useImageHandler } from "../../hooks/useImageHandler";
import { useDragAndDrop } from "../../hooks/useDragAndDrop";
import { usePasteHandler } from "../../hooks/usePasteHandler";
import {
  getInputHighlightSegments,
  getWorkflowCommandInfo,
  getFileReferenceInfo,
  WorkflowCommandInfo,
  FileReferenceInfo,
} from "../../utils/inputHighlight";
import {
  processFiles,
  separateImageFiles,
  ProcessedFile,
} from "../../utils/fileUtils";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

import { Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";

const { TextArea } = Input;
// ToolService import removed - no longer needed for tool validation

export interface MessageInputInteractionControls {
  isStreaming: boolean;
  hasMessages: boolean;
  allowRetry?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
  onHistoryNavigate?: (
    direction: "previous" | "next",
    currentValue: string,
  ) => string | null;
}

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string, images?: ImageFile[]) => void;
  placeholder?: string;
  disabled?: boolean;
  interaction: MessageInputInteractionControls;
  images?: ImageFile[];
  onImagesChange?: (images: ImageFile[]) => void;
  allowImages?: boolean;
  isWorkflowSelectorVisible?: boolean; // Prevent Enter key handling when workflow selector is open
  validateMessage?: (message: string) => {
    isValid: boolean;
    errorMessage?: string;
  };
  onAttachmentsAdded?: (files: ProcessedFile[]) => void;
  onWorkflowCommandChange?: (info: WorkflowCommandInfo) => void;
  onFileReferenceChange?: (info: FileReferenceInfo) => void;
  maxCharCount?: number;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  value,
  onChange,
  onSubmit,
  interaction,
  placeholder = "Send a message...",
  disabled = false,
  images: propImages,
  onImagesChange,
  allowImages = true,
  isWorkflowSelectorVisible = false,
  validateMessage,
  onAttachmentsAdded,
  onWorkflowCommandChange,
  onFileReferenceChange,
  maxCharCount = 8000,
}) => {
  const {
    isStreaming,
    hasMessages,
    allowRetry = true,
    onRetry,
    onCancel,
    onHistoryNavigate,
  } = interaction;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<TextAreaRef>(null);
  const highlightOverlayRef = useRef<HTMLDivElement>(null);
  const { token } = theme.useToken();
  const [messageApi, contextHolder] = message.useMessage();
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);
  const charCount = value.length;
  const isOverCharLimit = charCount > maxCharCount;
  const isNearCharLimit = !isOverCharLimit && charCount >= maxCharCount * 0.9;

  const {
    images,
    setImages,
    previewModalVisible,
    setPreviewModalVisible,
    previewImageIndex,
    handleImageFiles,
    handleRemoveImage: _handleRemoveImage,
    handleImagePreview,
    clearImages,
  } = useImageHandler(allowImages);

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      if (!files || files.length === 0) return;
      const { images: imageFiles, others } = separateImageFiles(files);
      if (imageFiles.length > 0) {
        await handleImageFiles(imageFiles);
      }
      if (others.length > 0 && onAttachmentsAdded) {
        setIsProcessingAttachments(true);
        const { processed, errors } = await processFiles(others);
        if (processed.length > 0) {
          onAttachmentsAdded(processed);
          messageApi.success(`Added ${processed.length} file(s)`);
        }
        errors.forEach((err) => messageApi.error(err));
        setIsProcessingAttachments(false);
      }
    },
    [handleImageFiles, messageApi, onAttachmentsAdded],
  );

  const { isDragOver, handleDragOver, handleDragLeave, handleDrop } =
    useDragAndDrop({ onFiles: handleDroppedFiles, mode: "any" });

  const { handlePaste } = usePasteHandler({
    onImages: handleImageFiles,
    onAttachments: onAttachmentsAdded
      ? async (files) => {
          setIsProcessingAttachments(true);
          const { processed, errors } = await processFiles(files);
          if (processed.length > 0) {
            onAttachmentsAdded(processed);
            messageApi.success(`Attached ${processed.length} file(s)`);
          }
          errors.forEach((err) => messageApi.error(err));
          setIsProcessingAttachments(false);
        }
      : undefined,
    allowImages,
  });

  const debouncedValue = useDebouncedValue(value, 80);

  const highlightSegments = useMemo(
    () => getInputHighlightSegments(debouncedValue),
    [debouncedValue],
  );

  const syncOverlayScroll = () => {
    const textArea = textAreaRef.current?.resizableTextArea?.textArea;
    if (!textArea || !highlightOverlayRef.current) return;
    const scrollTop = textArea.scrollTop;
    const scrollLeft = textArea.scrollLeft;
    highlightOverlayRef.current.style.transform = `translate(${-scrollLeft}px, ${-scrollTop}px)`;
  };

  useEffect(() => {
    syncOverlayScroll();
  }, [value]);

  useEffect(() => {
    if (onWorkflowCommandChange) {
      onWorkflowCommandChange(getWorkflowCommandInfo(debouncedValue));
    }
  }, [debouncedValue, onWorkflowCommandChange]);

  useEffect(() => {
    if (onFileReferenceChange) {
      onFileReferenceChange(getFileReferenceInfo(debouncedValue));
    }
  }, [debouncedValue, onFileReferenceChange]);

  useEffect(() => {
    if (onImagesChange) {
      onImagesChange(images);
    }
  }, [images, onImagesChange]);

  useEffect(() => {
    if (propImages) {
      setImages(propImages);
    }
  }, [propImages, setImages]);

  // Note: Tool validation logic removed - users no longer input tool commands directly
  // Tools are now called autonomously by LLM based on user intent

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      onHistoryNavigate &&
      !disabled &&
      !isStreaming &&
      !event.shiftKey &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      const direction = event.key === "ArrowUp" ? "previous" : "next";
      const historyValue = onHistoryNavigate(direction, value);
      if (historyValue !== null && historyValue !== undefined) {
        event.preventDefault();
        onChange(historyValue);
        requestAnimationFrame(() => {
          const textArea =
            textAreaRef.current?.resizableTextArea?.textArea || null;
          if (textArea) {
            const caret = historyValue.length;
            textArea.setSelectionRange(caret, caret);
          }
        });
        return;
      }
    }

    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isStreaming &&
      !disabled &&
      !isWorkflowSelectorVisible
    ) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = () => {
    const trimmedContent = value.trim();
    if ((!trimmedContent && images.length === 0) || isStreaming || disabled)
      return;

    if (isOverCharLimit) {
      messageApi.error(
        `Message exceeds the maximum length of ${maxCharCount.toLocaleString()} characters.`,
      );
      return;
    }

    // If validation function is provided, validate first
    if (validateMessage) {
      const validation = validateMessage(trimmedContent);

      if (!validation.isValid) {
        // Show error message
        messageApi.error(
          validation.errorMessage || "Message format is incorrect",
        );
        return;
      }
    }

    onSubmit(trimmedContent, images.length > 0 ? images : undefined);
    clearImages();
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
                onClick={clearImages}
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
          <div
            style={{
              position: "relative",
              flex: 1,
            }}
          >
            <div
              ref={highlightOverlayRef}
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                padding: "8px 0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                pointerEvents: "none",
                color: token.colorText,
                fontSize: token.fontSize,
                lineHeight: 1.5,
                transform: "translate(0, 0)",
              }}
            >
              {value ? (
                highlightSegments.map((segment, index) => {
                  let style: React.CSSProperties | undefined;
                  if (segment.type === "workflow") {
                    style = {
                      backgroundColor: token.colorPrimaryBg,
                      color: token.colorPrimary,
                      fontWeight: 500,
                      borderRadius: token.borderRadiusSM,
                      padding: "0 2px",
                    };
                  } else if (segment.type === "file") {
                    style = {
                      backgroundColor: token.colorSuccessBg,
                      color: token.colorSuccess,
                      borderRadius: token.borderRadiusSM,
                      padding: "0 2px",
                    };
                  }
                  return (
                    <span key={`segment-${index}`} style={style}>
                      {segment.text}
                    </span>
                  );
                })
              ) : (
                <span style={{ color: token.colorTextQuaternary }}>
                  {placeholder}
                </span>
              )}
              {value.endsWith("\n") ? "\n" : null}
            </div>
            <TextArea
              ref={textAreaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              disabled={disabled}
              autoSize={{ minRows: 2, maxRows: 6 }}
              variant="borderless"
              onScroll={syncOverlayScroll}
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
                background: "transparent",
                color: "transparent",
                caretColor: token.colorText,
                position: "relative",
                zIndex: 1,
              }}
            />
          </div>

          {/* Right side buttons */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "center",
              gap: token.marginXS,
            }}
          >
            {allowRetry && hasMessages && (
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
              loading={isStreaming && !onCancel}
              disabled={
                isStreaming
                  ? !onCancel || disabled
                  : (!value.trim() && images.length === 0) ||
                    disabled ||
                    isOverCharLimit
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

      <div
        style={{
          marginTop: token.marginXXS,
          textAlign: "right",
        }}
      >
        <Text
          type={
            isOverCharLimit
              ? "danger"
              : isNearCharLimit
                ? "warning"
                : "secondary"
          }
          style={{ fontSize: token.fontSizeSM }}
        >
          {charCount.toLocaleString()} / {maxCharCount.toLocaleString()}
        </Text>
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

      {isProcessingAttachments && (
        <div style={{ marginTop: token.marginXS }}>
          <Spin size="small" />
          <Text type="secondary" style={{ marginLeft: token.marginXS }}>
            Processing files…
          </Text>
        </div>
      )}
    </>
  );
};
