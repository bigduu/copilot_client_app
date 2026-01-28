import { useCallback } from "react";

interface PasteHandlerOptions {
  onImages: (files: File[]) => void;
  onAttachments?: (files: File[]) => void;
  allowImages: boolean;
}

export const usePasteHandler = ({
  onImages,
  onAttachments,
  allowImages,
}: PasteHandlerOptions) => {
  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!e.clipboardData) return;

      const items = Array.from(e.clipboardData.items);
      const images: File[] = [];
      const otherFiles: File[] = [];

      items.forEach((item) => {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (!file) return;
          if (file.type.startsWith("image/")) {
            images.push(file);
          } else {
            otherFiles.push(file);
          }
        }
      });

      if (images.length > 0 && allowImages) {
        e.preventDefault();
        onImages(images);
      }

      if (otherFiles.length > 0 && onAttachments) {
        e.preventDefault();
        onAttachments(otherFiles);
      }
    },
    [allowImages, onImages, onAttachments],
  );

  return { handlePaste };
};
