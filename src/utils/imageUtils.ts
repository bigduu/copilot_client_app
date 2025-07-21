/**
 * Image utility functions for handling image upload, validation, and processing
 */

export interface ImageFile {
  file: File;
  base64: string;
  preview: string;
  id: string;
  name: string;
  size: number;
  type: string;
}

export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
}

// Supported image types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp'
];

// Maximum file size (10MB)
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

// Maximum image dimensions
export const MAX_IMAGE_WIDTH = 4096;
export const MAX_IMAGE_HEIGHT = 4096;

/**
 * Validate if a file is a supported image
 */
export const validateImageFile = (file: File): ImageValidationResult => {
  // Check file type
  if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
    return {
      isValid: false,
      error: `Unsupported image type: ${file.type}. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`
    };
  }

  // Check file size
  if (file.size > MAX_IMAGE_SIZE) {
    return {
      isValid: false,
      error: `Image size too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`
    };
  }

  return { isValid: true };
};

/**
 * Convert file to base64 string
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

/**
 * Create image preview URL
 */
export const createImagePreview = (file: File): string => {
  return URL.createObjectURL(file);
};

/**
 * Process image file and return ImageFile object
 */
export const processImageFile = async (file: File): Promise<ImageFile> => {
  const validation = validateImageFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const base64 = await fileToBase64(file);
  const preview = createImagePreview(file);
  const id = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return {
    file,
    base64,
    preview,
    id,
    name: file.name,
    size: file.size,
    type: file.type
  };
};

/**
 * Process multiple image files
 */
export const processImageFiles = async (files: FileList | File[]): Promise<ImageFile[]> => {
  const fileArray = Array.from(files);
  const processedImages: ImageFile[] = [];

  for (const file of fileArray) {
    try {
      const imageFile = await processImageFile(file);
      processedImages.push(imageFile);
    } catch (error) {
      console.error(`Failed to process image ${file.name}:`, error);
      // Continue processing other files
    }
  }

  return processedImages;
};

/**
 * Extract base64 data from data URL
 */
export const extractBase64Data = (dataUrl: string): string => {
  const base64Index = dataUrl.indexOf(',');
  return base64Index !== -1 ? dataUrl.substring(base64Index + 1) : dataUrl;
};

/**
 * Get image MIME type from base64 data URL
 */
export const getMimeTypeFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match ? match[1] : 'image/png';
};

/**
 * Validate image dimensions
 */
export const validateImageDimensions = (image: HTMLImageElement): ImageValidationResult => {
  if (image.width > MAX_IMAGE_WIDTH || image.height > MAX_IMAGE_HEIGHT) {
    return {
      isValid: false,
      error: `Image dimensions too large: ${image.width}x${image.height}. Maximum: ${MAX_IMAGE_WIDTH}x${MAX_IMAGE_HEIGHT}`
    };
  }
  return { isValid: true };
};

/**
 * Load image and validate dimensions
 */
export const loadAndValidateImage = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const validation = validateImageDimensions(img);
      if (!validation.isValid) {
        reject(new Error(validation.error));
      } else {
        resolve(img);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
};

/**
 * Resize image if it exceeds maximum dimensions
 */
export const resizeImageIfNeeded = (
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  maxWidth: number = MAX_IMAGE_WIDTH,
  maxHeight: number = MAX_IMAGE_HEIGHT
): void => {
  let { width, height } = image;

  // Calculate new dimensions if resizing is needed
  if (width > maxWidth || height > maxHeight) {
    const aspectRatio = width / height;
    
    if (width > height) {
      width = maxWidth;
      height = width / aspectRatio;
    } else {
      height = maxHeight;
      width = height * aspectRatio;
    }
  }

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(image, 0, 0, width, height);
  }
};

/**
 * Convert canvas to base64 data URL
 */
export const canvasToBase64 = (canvas: HTMLCanvasElement, quality: number = 0.8): string => {
  return canvas.toDataURL('image/jpeg', quality);
};

/**
 * Clean up object URLs to prevent memory leaks
 */
export const cleanupImagePreview = (preview: string): void => {
  if (preview.startsWith('blob:')) {
    URL.revokeObjectURL(preview);
  }
};

/**
 * Clean up multiple image previews
 */
export const cleanupImagePreviews = (images: ImageFile[]): void => {
  images.forEach(image => cleanupImagePreview(image.preview));
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Check if drag event contains image files
 */
export const hasImageFiles = (dataTransfer: DataTransfer): boolean => {
  if (!dataTransfer.files || dataTransfer.files.length === 0) {
    return false;
  }

  return Array.from(dataTransfer.files).some(file => 
    SUPPORTED_IMAGE_TYPES.includes(file.type)
  );
};

/**
 * Extract image files from drag event
 */
export const extractImageFiles = (dataTransfer: DataTransfer): File[] => {
  if (!dataTransfer.files) {
    return [];
  }

  return Array.from(dataTransfer.files).filter(file => 
    SUPPORTED_IMAGE_TYPES.includes(file.type)
  );
};
