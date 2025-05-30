import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { message } from "antd";

interface PastedImage {
  id: string;
  file: File;
  dataUrl: string;
  savedPath?: string;
}

interface ImageSaveResult {
  path: string;
  filename: string;
  base64_data?: string;
}

interface OcrResult {
  text: string;
  confidence?: number;
}

export const useImagePaste = () => {
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handlePaste = useCallback(async (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    const textData: string[] = [];
    
    // 检查剪贴板中的内容
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          imageFiles.push(file);
        }
      } else if (item.type === "text/plain") {
        try {
          const text = await new Promise<string>((resolve) => {
            item.getAsString(resolve);
          });
          textData.push(text);
        } catch (error) {
          console.error("Failed to get text data:", error);
        }
      }
    }

    // 如果没有图片文件，检查文本是否为图片文件路径
    if (imageFiles.length === 0 && textData.length > 0) {
      for (const text of textData) {
        // 检查是否为图片文件路径
        if (text && (
          text.match(/\.(png|jpg|jpeg|gif|bmp|webp)$/i) ||
          text.includes("/CleanShot/") ||
          text.includes("Screenshot")
        )) {
          await handleImagePath(text);
          return;
        }
      }
      return; // 不是图片相关内容
    }

    if (imageFiles.length === 0) return;

    setIsProcessing(true);
    
    try {
      const newImages: PastedImage[] = [];
      
      for (const file of imageFiles) {
        // 创建本地预览 URL
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });

        // 获取文件扩展名
        const fileExtension = file.name.split('.').pop() || 
          file.type.split('/')[1] || 'png';

        try {
          // 调用 Tauri 命令保存图片
          const result = await invoke<ImageSaveResult>("save_image_to_tmp", {
            imageData: dataUrl,
            fileExtension,
          });

          const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          newImages.push({
            id: imageId,
            file,
            dataUrl,
            savedPath: result.path,
          });
        } catch (error) {
          console.error("Failed to save image:", error);
          message.error(`保存图片失败: ${error}`);
        }
      }

      if (newImages.length > 0) {
        setPastedImages(prev => [...prev, ...newImages]);
        message.success(`成功粘贴 ${newImages.length} 张图片`);
      }
    } catch (error) {
      console.error("Error processing pasted images:", error);
      message.error("处理粘贴图片时发生错误");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // 处理图片文件路径
  const handleImagePath = useCallback(async (filePath: string) => {
    setIsProcessing(true);
    
    try {
      // 调用 Tauri 命令读取图片文件
      const result = await invoke<ImageSaveResult>("read_image_file", {
        filePath: filePath.trim(),
      });

      // 创建一个虚拟的 File 对象用于预览
      const fileName = filePath.split('/').pop() || 'image.png';
      const virtualFile = new File([], fileName, { type: 'image/png' });

      // 使用返回的 base64 数据作为预览 URL
      const dataUrl = result.base64_data || `data:image/png;base64,`;

      const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newImage: PastedImage = {
        id: imageId,
        file: virtualFile,
        dataUrl,
        savedPath: result.path,
      };

      setPastedImages(prev => [...prev, newImage]);
      message.success("成功粘贴图片");
    } catch (error) {
      console.error("Failed to read image file:", error);
      message.error(`读取图片文件失败: ${error}`);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setPastedImages(prev => {
      const image = prev.find(img => img.id === imageId);
      if (image) {
        // 释放本地 URL
        URL.revokeObjectURL(image.dataUrl);
      }
      return prev.filter(img => img.id !== imageId);
    });
  }, []);

  const clearAllImages = useCallback(() => {
    pastedImages.forEach(image => {
      URL.revokeObjectURL(image.dataUrl);
    });
    setPastedImages([]);
  }, [pastedImages]);

  const getImagePaths = useCallback(() => {
    return pastedImages
      .filter(img => img.savedPath)
      .map(img => img.savedPath!);
  }, [pastedImages]);

  const getImageDescriptions = useCallback(() => {
    return pastedImages.map(img => ({
      name: img.file.name || `image.${img.file.type.split('/')[1] || 'png'}`,
      path: img.savedPath,
      size: img.file.size,
      type: img.file.type,
    }));
  }, [pastedImages]);

  // OCR processing method
  const processImagesWithOCR = useCallback(async (language?: string): Promise<string[]> => {
    const ocrResults: string[] = [];
    
    for (const image of pastedImages) {
      if (!image.savedPath) continue;
      
      try {
        const result = await invoke<OcrResult>("extract_text_from_image", {
          imagePath: image.savedPath,
          language: language || "eng",
        });
        
        if (result.text && result.text.trim()) {
          ocrResults.push(`[Image: ${image.file.name}]\n${result.text.trim()}`);
        }
      } catch (error) {
        console.error(`OCR failed for ${image.file.name}:`, error);
        // Continue processing other images even if one fails
      }
    }
    
    return ocrResults;
  }, [pastedImages]);

  return {
    pastedImages,
    isProcessing,
    handlePaste,
    removeImage,
    clearAllImages,
    getImagePaths,
    getImageDescriptions,
    processImagesWithOCR,
  };
};
