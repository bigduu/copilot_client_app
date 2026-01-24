import { useCallback } from "react";
import type { TextAreaRef } from "antd/es/input/TextArea";
import type { ImageFile } from "../../utils/imageUtils";

interface UseMessageInputHandlersProps {
  value: string;
  images: ImageFile[];
  isStreaming: boolean;
  disabled: boolean;
  isWorkflowSelectorVisible: boolean;
  onChange: (value: string) => void;
  onSubmit: (content: string, images?: ImageFile[]) => void;
  onRetry?: () => void;
  onHistoryNavigate?: (
    direction: "previous" | "next",
    currentValue: string,
  ) => string | null;
  validateMessage?: (message: string) => {
    isValid: boolean;
    errorMessage?: string;
  };
  isOverCharLimit: boolean;
  maxCharCount: number;
  messageApi: {
    error: (content: string) => void;
  };
  clearImages: () => void;
  textAreaRef: React.RefObject<TextAreaRef>;
}

export const useMessageInputHandlers = ({
  value,
  images,
  isStreaming,
  disabled,
  isWorkflowSelectorVisible,
  onChange,
  onSubmit,
  onRetry,
  onHistoryNavigate,
  validateMessage,
  isOverCharLimit,
  maxCharCount,
  messageApi,
  clearImages,
  textAreaRef,
}: UseMessageInputHandlersProps) => {
  const handleSubmit = useCallback(() => {
    const trimmedContent = value.trim();
    if ((!trimmedContent && images.length === 0) || isStreaming || disabled) {
      return;
    }

    if (isOverCharLimit) {
      messageApi.error(
        `Message exceeds the maximum length of ${maxCharCount.toLocaleString()} characters.`,
      );
      return;
    }

    if (validateMessage) {
      const validation = validateMessage(trimmedContent);

      if (!validation.isValid) {
        messageApi.error(
          validation.errorMessage || "Message format is incorrect",
        );
        return;
      }
    }

    onSubmit(trimmedContent, images.length > 0 ? images : undefined);
    clearImages();
  }, [
    clearImages,
    disabled,
    images,
    isOverCharLimit,
    isStreaming,
    maxCharCount,
    messageApi,
    onSubmit,
    validateMessage,
    value,
  ]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    },
    [
      disabled,
      handleSubmit,
      isStreaming,
      isWorkflowSelectorVisible,
      onChange,
      onHistoryNavigate,
      textAreaRef,
      value,
    ],
  );

  const handleRetry = useCallback(() => {
    if (isStreaming || disabled || !onRetry) return;
    onRetry();
  }, [disabled, isStreaming, onRetry]);

  return {
    handleKeyDown,
    handleSubmit,
    handleRetry,
  };
};
