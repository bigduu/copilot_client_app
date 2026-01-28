import { useState, useCallback } from "react";
import { hasImageFiles, extractImageFiles } from "../utils/imageUtils";

interface DragAndDropOptions {
  onFiles: (files: File[]) => void;
  mode?: "images" | "any";
}

export const useDragAndDrop = ({
  onFiles,
  mode = "images",
}: DragAndDropOptions) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const hasAllowedFiles =
        mode === "images"
          ? hasImageFiles(e.dataTransfer)
          : e.dataTransfer?.files?.length > 0;
      if (hasAllowedFiles) setIsDragOver(true);
    },
    [mode],
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

      if (mode === "images") {
        const imageFiles = extractImageFiles(e.dataTransfer);
        if (imageFiles.length > 0) {
          onFiles(imageFiles);
        }
        return;
      }

      const droppedFiles = Array.from(e.dataTransfer.files || []);
      if (droppedFiles.length > 0) {
        onFiles(droppedFiles);
      }
    },
    [mode, onFiles],
  );

  return {
    isDragOver,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
};
