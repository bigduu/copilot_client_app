import { useState, useCallback } from "react";
import { message } from "antd";
import {
  ImageFile,
  processImageFiles,
  cleanupImagePreviews,
} from "../utils/imageUtils";

export const useImageHandler = (allowImages: boolean) => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  const handleImageFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!allowImages) return;

      try {
        const processedImages = await processImageFiles(files);
        if (processedImages.length > 0) {
          setImages((prevImages) => [...prevImages, ...processedImages]);
          message.success(`Added ${processedImages.length} image(s)`);
        }
      } catch (error) {
        message.error(`Failed to process images: ${error}`);
      }
    },
    [allowImages]
  );

  const handleRemoveImage = useCallback(
    (imageId: string) => {
      const imageToRemove = images.find((img) => img.id === imageId);
      if (imageToRemove) {
        cleanupImagePreviews([imageToRemove]);
      }
      setImages((prevImages) => prevImages.filter((img) => img.id !== imageId));
    },
    [images]
  );

  const handleImagePreview = useCallback(
    (image: ImageFile) => {
      const index = images.findIndex((img) => img.id === image.id);
      setPreviewImageIndex(index >= 0 ? index : 0);
      setPreviewModalVisible(true);
    },
    [images]
  );

  const clearImages = useCallback(() => {
    cleanupImagePreviews(images);
    setImages([]);
  }, [images]);

  return {
    images,
    setImages,
    previewModalVisible,
    setPreviewModalVisible,
    previewImageIndex,
    handleImageFiles,
    handleRemoveImage,
    handleImagePreview,
    clearImages,
  };
};
