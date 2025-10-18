import { useState, useCallback } from "react";
import { hasImageFiles, extractImageFiles } from "../utils/imageUtils";

interface DragAndDropOptions {
  onFiles: (files: File[]) => void;
  allowImages: boolean;
}

export const useDragAndDrop = ({
  onFiles,
  allowImages,
}: DragAndDropOptions) => {
  const [isDragOver, setIsDragOver] = useState(false);

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
        onFiles(imageFiles);
      }
    },
    [allowImages, onFiles]
  );

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
