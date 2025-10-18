import { useCallback } from "react";

interface PasteHandlerOptions {
  onFiles: (files: File[]) => void;
  allowImages: boolean;
}

export const usePasteHandler = ({
  onFiles,
  allowImages,
}: PasteHandlerOptions) => {
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
        onFiles(imageFiles);
      }
    },
    [allowImages, onFiles]
  );

  return { handlePaste };
};
