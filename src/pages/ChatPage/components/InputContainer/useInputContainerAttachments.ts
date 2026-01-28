import { useCallback, useState } from "react";
import type { ProcessedFile } from "../../utils/fileUtils";

export const useInputContainerAttachments = () => {
  const [attachments, setAttachments] = useState<ProcessedFile[]>([]);

  const handleAttachmentsAdded = useCallback((files: ProcessedFile[]) => {
    setAttachments((prev) => [...prev, ...files]);
  }, []);

  const handleAttachmentRemove = useCallback((fileId: string) => {
    setAttachments((prev) => prev.filter((file) => file.id !== fileId));
  }, []);

  const handleClearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    setAttachments,
    handleAttachmentsAdded,
    handleAttachmentRemove,
    handleClearAttachments,
  };
};
