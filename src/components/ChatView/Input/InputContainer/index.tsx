import React, { useEffect, useState, useRef, useCallback } from "react";
import { Button, Space, Tooltip, Spin, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { MessageInput } from "../MessageInput";
import SystemPromptModal from "../../../Shared/SystemPromptModal";
import InputPreview from "./InputPreview";
import { ImagePreview } from "./ImagePreview";
import { useChat } from "../../../../contexts/ChatView";
import { useImagePaste } from "../../../../hooks/ChatView";

const { useToken } = theme;

interface InputContainerProps {
  isStreaming: boolean;
  isCenteredLayout?: boolean;
}

export const InputContainer: React.FC<InputContainerProps> = ({
  isStreaming,
  isCenteredLayout = false,
}) => {
  const [isPromptModalOpen, setPromptModalOpen] = React.useState(false);
  // Store reference text per chatId
  const [referenceMap, setReferenceMap] = useState<{
    [chatId: string]: string | null;
  }>({});
  const { token } = useToken();
  const { currentChatId } = useChat();
  const prevChatIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Image paste functionality
  const {
    pastedImages,
    isProcessing,
    handlePaste,
    removeImage,
    clearAllImages,
    getImagePaths,
    processImagesWithOCR,
  } = useImagePaste();

  // Clear reference text - using useCallback to ensure stable reference
  const clearReferenceText = useCallback((chatId: string) => {
    if (!chatId) return;

    setReferenceMap((prevMap) => {
      const newMap = { ...prevMap };
      newMap[chatId] = null;
      return newMap;
    });
  }, []);

  // Listen for reference-text events from MessageCard/FavoritesPanel
  useEffect(() => {
    const handleReferenceText = (e: Event) => {
      const customEvent = e as CustomEvent<{ text: string; chatId?: string }>;
      const chatId = customEvent.detail.chatId || currentChatId;
      if (chatId) {
        setReferenceMap((prev) => ({
          ...prev,
          [chatId]: customEvent.detail.text,
        }));
      }
    };

    window.addEventListener("reference-text", handleReferenceText);

    return () => {
      window.removeEventListener("reference-text", handleReferenceText);
    };
  }, [currentChatId]);

  // Clear reference when chat switches
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      clearReferenceText(prevChatIdRef.current);
    }
    prevChatIdRef.current = currentChatId;
  }, [currentChatId, clearReferenceText]);

  // Add paste event listener
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("paste", handlePaste);
      return () => {
        container.removeEventListener("paste", handlePaste);
      };
    }
  }, [handlePaste]);

  // Clear images when chat switches
  useEffect(() => {
    if (prevChatIdRef.current && prevChatIdRef.current !== currentChatId) {
      clearAllImages();
    }
  }, [currentChatId, clearAllImages]);

  const handleInputSubmit = useCallback(
    (_content: string) => {
      // Clear reference after submitting for current chat
      if (currentChatId) {
        clearReferenceText(currentChatId);
      }
      // Clear images after submitting
      clearAllImages();
    },
    [currentChatId, clearReferenceText, clearAllImages]
  );

  // Calculate current reference text
  const referenceText = currentChatId ? referenceMap[currentChatId] : null;

  // Handler for closing the input preview
  const handleClosePreview = useCallback(() => {
    if (currentChatId) {
      clearReferenceText(currentChatId);
    }
  }, [currentChatId, clearReferenceText]);

  return (
    <div
      ref={containerRef}
      style={{
        padding: token.paddingMD,
        background: token.colorBgContainer,
        borderTop: isCenteredLayout
          ? "none"
          : `1px solid ${token.colorBorderSecondary}`,
        boxShadow: isCenteredLayout ? "none" : "0 -2px 8px rgba(0,0,0,0.06)",
        width: "100%",
      }}
      tabIndex={-1} // Make div focusable for paste events
    >
      {referenceText && (
        <InputPreview text={referenceText} onClose={handleClosePreview} />
      )}

      {/* Render pasted images */}
      {pastedImages.length > 0 && (
        <div style={{ marginBottom: token.marginSM }}>
          {pastedImages.map((image) => (
            <ImagePreview
              key={image.id}
              imageUrl={image.dataUrl}
              fileName={
                image.file.name ||
                `image.${image.file.type.split("/")[1] || "png"}`
              }
              onRemove={() => removeImage(image.id)}
            />
          ))}
        </div>
      )}

      {/* Processing indicator */}
      {isProcessing && (
        <div style={{ marginBottom: token.marginSM, textAlign: "center" }}>
          <Space size="small">
            <Spin size="small" />
            <span
              style={{
                color: token.colorTextSecondary,
                fontSize: token.fontSizeSM,
              }}
            >
              正在处理图片...
            </span>
          </Space>
        </div>
      )}

      <Space.Compact block>
        <Tooltip title="Customize System Prompt">
          <Button
            icon={<SettingOutlined />}
            onClick={() => setPromptModalOpen(true)}
            aria-label="Customize System Prompt"
            size={isCenteredLayout ? "large" : "middle"}
            style={
              isCenteredLayout
                ? {
                    height: "auto",
                    padding: `${token.paddingSM}px ${token.paddingContentHorizontal}px`,
                  }
                : {}
            }
          />
        </Tooltip>
        <MessageInput
          isStreamingInProgress={isStreaming}
          isCenteredLayout={isCenteredLayout}
          referenceText={referenceText}
          onSubmit={handleInputSubmit}
          processImagesWithOCR={processImagesWithOCR}
          hasImages={pastedImages.length > 0}
        />
      </Space.Compact>

      {isStreaming && (
        <Space
          style={{
            marginTop: token.marginSM,
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
          size={token.marginXS}
        >
          <Spin size="small" />
          <span>AI is thinking...</span>
        </Space>
      )}

      <SystemPromptModal
        open={isPromptModalOpen}
        onClose={() => setPromptModalOpen(false)}
      />
    </div>
  );
};
