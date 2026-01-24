import { useEffect } from "react";
import {
  getFileReferenceInfo,
  getWorkflowCommandInfo,
} from "../../utils/inputHighlight";
import type {
  FileReferenceInfo,
  WorkflowCommandInfo,
} from "../../utils/inputHighlight";
import type { ImageFile } from "../../utils/imageUtils";

interface UseMessageInputEffectsProps {
  value: string;
  debouncedValue: string;
  onWorkflowCommandChange?: (info: WorkflowCommandInfo) => void;
  onFileReferenceChange?: (info: FileReferenceInfo) => void;
  onImagesChange?: (images: ImageFile[]) => void;
  images: ImageFile[];
  propImages?: ImageFile[];
  setImages: (images: ImageFile[]) => void;
  syncOverlayScroll: () => void;
}

export const useMessageInputEffects = ({
  value,
  debouncedValue,
  onWorkflowCommandChange,
  onFileReferenceChange,
  onImagesChange,
  images,
  propImages,
  setImages,
  syncOverlayScroll,
}: UseMessageInputEffectsProps) => {
  useEffect(() => {
    syncOverlayScroll();
  }, [value, syncOverlayScroll]);

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
};
