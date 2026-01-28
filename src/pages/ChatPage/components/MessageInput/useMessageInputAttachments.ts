import { useCallback, useState } from "react";
import { useDragAndDrop } from "../../hooks/useDragAndDrop";
import { useImageHandler } from "../../hooks/useImageHandler";
import { usePasteHandler } from "../../hooks/usePasteHandler";
import {
  processFiles,
  separateImageFiles,
  type ProcessedFile,
} from "../../utils/fileUtils";

interface UseMessageInputAttachmentsProps {
  allowImages: boolean;
  onAttachmentsAdded?: (files: ProcessedFile[]) => void;
  messageApi: {
    success: (content: string) => void;
    error: (content: string) => void;
  };
}

export const useMessageInputAttachments = ({
  allowImages,
  onAttachmentsAdded,
  messageApi,
}: UseMessageInputAttachmentsProps) => {
  const [isProcessingAttachments, setIsProcessingAttachments] = useState(false);

  const {
    images,
    setImages,
    previewModalVisible,
    setPreviewModalVisible,
    previewImageIndex,
    handleImageFiles,
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

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleImageFiles(files);
      }
      e.target.value = "";
    },
    [handleImageFiles],
  );

  return {
    images,
    setImages,
    previewModalVisible,
    setPreviewModalVisible,
    previewImageIndex,
    handleImageFiles,
    handleImagePreview,
    clearImages,
    isProcessingAttachments,
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handlePaste,
    handleFileInputChange,
  };
};
