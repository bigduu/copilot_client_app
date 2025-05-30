import React, { useState, useRef, useEffect } from "react";
import { Input, Button, Space, theme } from "antd";
import { SendOutlined, SyncOutlined } from "@ant-design/icons";
import { useChat } from "../../../../contexts/ChatView";

interface MessageInputProps {
  onSubmit?: (content: string) => void;
  isStreamingInProgress: boolean;
  isCenteredLayout?: boolean;
  referenceText?: string | null;
  processImagesWithOCR?: () => Promise<string[]>;
  hasImages?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  onSubmit,
  isStreamingInProgress,
  isCenteredLayout = false,
  referenceText = null,
  processImagesWithOCR,
  hasImages = false,
}) => {
  const [content, setContent] = useState("");
  const [hiddenReference, setHiddenReference] = useState<string | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const { token } = theme.useToken();

  const { sendMessage, initiateAIResponse, currentMessages } = useChat();

  // Store or clear reference text when it changes
  useEffect(() => {
    if (referenceText) {
      setHiddenReference(referenceText);

      // Focus the textarea
      if (textAreaRef.current) {
        setTimeout(() => {
          textAreaRef.current?.focus();
        }, 50);
      }
    } else {
      // Clear the hidden reference when referenceText becomes null
      setHiddenReference(null);
    }
  }, [referenceText]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !isStreamingInProgress) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (
      (!trimmedContent && !hiddenReference && !hasImages) ||
      isStreamingInProgress ||
      isOcrProcessing
    )
      return;

    console.log("Submitting message:", trimmedContent);

    let messageToSend = trimmedContent;

    // Process images with OCR if available
    if (hasImages && processImagesWithOCR) {
      setIsOcrProcessing(true);
      try {
        const ocrResults = await processImagesWithOCR();
        if (ocrResults.length > 0) {
          const ocrText = ocrResults.join("\n\n");
          messageToSend = messageToSend
            ? `${messageToSend}\n\n${ocrText}`
            : ocrText;
        }
      } catch (error) {
        console.error("OCR processing failed:", error);
        // Continue with message sending even if OCR fails
      } finally {
        setIsOcrProcessing(false);
      }
    }

    // Append reference text if it exists (but only in the background)
    if (hiddenReference) {
      messageToSend = messageToSend
        ? `${hiddenReference}\n\n${messageToSend}`
        : hiddenReference;
    }

    if (onSubmit) {
      onSubmit(messageToSend);
    }

    try {
      await sendMessage(messageToSend);
    } catch (error) {
      console.error("Error sending message:", error);
    }

    setContent("");
    setHiddenReference(null);
  };

  const handleAIRetry = async () => {
    if (isStreamingInProgress) return;

    try {
      await initiateAIResponse();
    } catch (error) {
      console.error("Error initiating AI response:", error);
    }
  };

  return (
    <Space.Compact block style={{ width: "100%" }}>
      <Input.TextArea
        ref={textAreaRef}
        autoSize={{ minRows: isCenteredLayout ? 3 : 1, maxRows: 8 }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          isOcrProcessing
            ? "Processing images with OCR..."
            : hiddenReference
            ? "Send a message (includes reference)"
            : hasImages
            ? "Send a message (images will be processed with OCR)"
            : "Send a message..."
        }
        disabled={isStreamingInProgress || isOcrProcessing}
        style={{
          resize: "none",
          borderRadius: 0,
          backgroundColor: token.colorBgContainer,
          padding: isCenteredLayout
            ? `${token.paddingSM}px ${token.padding}px`
            : undefined,
          fontSize: isCenteredLayout ? token.fontSizeLG : undefined,
        }}
      />
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleSubmit}
        disabled={
          (!content.trim() && !hiddenReference && !hasImages) ||
          isStreamingInProgress ||
          isOcrProcessing
        }
        size={isCenteredLayout ? "large" : "middle"}
        style={{
          height: isCenteredLayout ? "auto" : undefined,
        }}
      >
        Send
      </Button>
      {currentMessages.length > 0 && (
        <Button
          icon={<SyncOutlined spin={isStreamingInProgress} />}
          onClick={handleAIRetry}
          disabled={isStreamingInProgress}
          title="Regenerate last AI response"
          size={isCenteredLayout ? "large" : "middle"}
          style={{
            height: isCenteredLayout ? "auto" : undefined,
          }}
        />
      )}
    </Space.Compact>
  );
};
