import { AttachmentProcessor as IAttachmentProcessor } from "../interfaces/chat-manager";
import {
  OperationResult,
  Attachment,
  AttachmentRequest,
  AttachmentResult,
} from "../types/unified-chat";

/**
 * Attachment Processor
 * Handles preprocessing and flow integration for attachments like images and files
 */
export class AttachmentProcessor implements IAttachmentProcessor {
  private initialized = false;
  private processingQueue = new Map<string, Promise<AttachmentResult>>();
  private cache = new Map<string, AttachmentResult>();
  private maxCacheSize = 100;
  private supportedTypes = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "text/plain",
    "application/json",
  ]);

  constructor() {}

  /**
   * Process attachments in batch
   */
  async processAttachments(
    attachments: Attachment[],
  ): Promise<OperationResult<AttachmentResult[]>> {
    try {
      if (!this.initialized) {
        throw new Error("AttachmentProcessor is not initialized");
      }

      if (!attachments || attachments.length === 0) {
        return {
          success: true,
          data: [],
          message: "No attachments to process",
        };
      }

      const results: AttachmentResult[] = [];
      const errors: string[] = [];

      // Process all attachments in parallel
      await Promise.allSettled(
        attachments.map(async (attachment) => {
          try {
            const request: AttachmentRequest = {
              type: attachment.type as "image" | "file" | "url",
              content: attachment.url,
              metadata: {
                name: attachment.name,
                size: attachment.size,
                mimeType: attachment.mimeType,
              },
            };

            const result = await this.processAttachment(request);
            if (result.success && result.data) {
              results.push(result.data);
            } else {
              errors.push(
                `Failed to process attachment ${attachment.name}: ${result.error || "Unknown error"}`,
              );
            }
          } catch (error) {
            errors.push(
              `Exception processing attachment ${attachment.name}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }),
      );

      if (errors.length > 0 && results.length === 0) {
        return {
          success: false,
          error: errors.join("; "),
          message: "Failed to process all attachments",
        };
      }

      return {
        success: true,
        data: results,
        message: `Successfully processed ${results.length} attachments${errors.length > 0 ? `, ${errors.length} failed` : ""}`,
      };
    } catch (error) {
      console.error("Failed to process attachments in batch:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to process attachments in batch",
      };
    }
  }

  /**
   * Process single attachment
   */
  async processAttachment(
    request: AttachmentRequest,
  ): Promise<OperationResult<AttachmentResult>> {
    try {
      if (!this.initialized) {
        throw new Error("AttachmentProcessor is not initialized");
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(request);

      // Check cache
      if (this.cache.has(cacheKey)) {
        const cachedResult = this.cache.get(cacheKey)!;
        return {
          success: true,
          data: cachedResult,
          message: "Get processing result from cache",
        };
      }

      // Check if it is being processed
      if (this.processingQueue.has(cacheKey)) {
        const result = await this.processingQueue.get(cacheKey)!;
        return {
          success: true,
          data: result,
          message: "Wait for the processing queue to complete",
        };
      }

      // Start processing
      const processingPromise = this.performProcessing(request);
      this.processingQueue.set(cacheKey, processingPromise);

      try {
        const result = await processingPromise;

        // Cache result
        this.addToCache(cacheKey, result);

        return {
          success: true,
          data: result,
          message: "Attachment processing complete",
        };
      } finally {
        // Remove from processing queue
        this.processingQueue.delete(cacheKey);
      }
    } catch (error) {
      console.error("Failed to process attachment:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to process attachment",
      };
    }
  }

  /**
   * Get processing result
   */
  async getResult(attachmentId: string): Promise<OperationResult<any>> {
    try {
      // Find result in cache
      for (const [, result] of this.cache.entries()) {
        if (result.attachment.id === attachmentId) {
          return {
            success: true,
            data: result,
            message: "Found attachment processing result",
          };
        }
      }

      return {
        success: false,
        error: "Attachment processing result not found",
        message: `Processing result for attachment ${attachmentId} does not exist`,
      };
    } catch (error) {
      console.error("Failed to get processing result:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to get processing result",
      };
    }
  }

  /**
   * Merge attachment summaries into content
   */
  mergeAttachmentSummaries(
    content: string,
    results: AttachmentResult[],
  ): string {
    try {
      if (!results || results.length === 0) {
        return content;
      }

      const summaries = results
        .filter((result) => result.summary && result.summary.trim())
        .map(
          (result) =>
            `[Attachment: ${result.attachment.name}]\n${result.summary}`,
        )
        .join("\n\n");

      if (!summaries) {
        return content;
      }

      // If content is empty, only return the summary
      if (!content || !content.trim()) {
        return summaries;
      }

      // Add the summary to the beginning of the content
      return `${summaries}\n\n${content}`;
    } catch (error) {
      console.error("Failed to merge attachment summaries:", error);
      return content;
    }
  }

  /**
   * Generate attachment prompt
   */
  generateAttachmentPrompt(attachment: Attachment): string {
    try {
      const type = attachment.type;
      const name = attachment.name;
      const size = this.formatFileSize(attachment.size);

      let prompt = `Processing attachment: ${name} (${size})`;

      switch (type) {
        case "image":
          prompt += `\nThis is an image, please analyze its content and provide a detailed description.`;
          break;
        case "file":
          if (attachment.mimeType.includes("text")) {
            prompt += `\nThis is a text file, please analyze its content and provide a summary.`;
          } else {
            prompt += `\nThis is a file, type: ${attachment.mimeType}.`;
          }
          break;
        case "screenshot":
          prompt += `\nThis is a screenshot, please analyze its content and provide a detailed description.`;
          break;
        default:
          prompt += `\nPlease analyze the content of this attachment.`;
      }

      return prompt;
    } catch (error) {
      console.error("Failed to generate attachment prompt:", error);
      return `Processing attachment: ${attachment.name}`;
    }
  }

  /**
   * Initialize
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Clear cache and queue
      this.cache.clear();
      this.processingQueue.clear();

      this.initialized = true;
      console.log("AttachmentProcessor initialized successfully");
    } catch (error) {
      throw new Error(
        `AttachmentProcessor initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    try {
      // Wait for all processing to complete
      if (this.processingQueue.size > 0) {
        await Promise.allSettled(Array.from(this.processingQueue.values()));
      }

      // Clean up resources
      this.cache.clear();
      this.processingQueue.clear();

      this.initialized = false;
      console.log("AttachmentProcessor has been disposed");
    } catch (error) {
      console.error("AttachmentProcessor disposal failed:", error);
    }
  }

  /**
   * Perform actual processing
   */
  private async performProcessing(
    request: AttachmentRequest,
  ): Promise<AttachmentResult> {
    const startTime = Date.now();

    try {
      // Validate attachment type
      this.validateAttachmentRequest(request);

      let summary = "";
      let originalContent = "";

      switch (request.type) {
        case "image":
          ({ summary, originalContent } = await this.processImage(request));
          break;
        case "file":
          ({ summary, originalContent } = await this.processFile(request));
          break;
        case "url":
          ({ summary, originalContent } = await this.processUrl(request));
          break;
        default:
          throw new Error(`Unsupported attachment type: ${request.type}`);
      }

      const processingTime = Date.now() - startTime;

      // Create attachment object
      const attachment: Attachment = {
        id: this.generateAttachmentId(),
        type: request.type as "image" | "file" | "screenshot",
        url: typeof request.content === "string" ? request.content : "",
        name: request.metadata?.name || `Attachment_${Date.now()}`,
        size: request.metadata?.size || 0,
        mimeType: request.metadata?.mimeType || "application/octet-stream",
      };

      return {
        attachment,
        summary,
        originalContent,
        processingTime,
      };
    } catch (error) {
      throw new Error(
        `Attachment processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Process image
   */
  private async processImage(
    request: AttachmentRequest,
  ): Promise<{ summary: string; originalContent: string }> {
    try {
      // Image analysis service should be called here, for now returning mock results
      const summary = `Image analysis result: ${request.metadata?.name || "Unknown image"}`;
      const originalContent =
        typeof request.content === "string"
          ? request.content
          : "[Image Content]";

      return { summary, originalContent };
    } catch (error) {
      throw new Error(
        `Image processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Process file
   */
  private async processFile(
    request: AttachmentRequest,
  ): Promise<{ summary: string; originalContent: string }> {
    try {
      let originalContent = "";

      if (typeof request.content === "string") {
        originalContent = request.content;
      } else if (request.content instanceof File) {
        originalContent = await this.readFileContent(request.content);
      } else {
        originalContent = "[File Content]";
      }

      const summary = `File summary: ${request.metadata?.name || "Unknown file"} - ${originalContent.substring(0, 200)}${originalContent.length > 200 ? "..." : ""}`;

      return { summary, originalContent };
    } catch (error) {
      throw new Error(
        `File processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Process URL
   */
  private async processUrl(
    request: AttachmentRequest,
  ): Promise<{ summary: string; originalContent: string }> {
    try {
      const url = typeof request.content === "string" ? request.content : "";
      const summary = `URL content summary:${url}`;
      const originalContent = url;

      return { summary, originalContent };
    } catch (error) {
      throw new Error(
        `URL processing failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Read file content
   */
  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        resolve((e.target?.result as string) || "");
      };

      reader.onerror = () => {
        reject(new Error("Failed to read file"));
      };

      // Select read method based on file type
      if (file.type.startsWith("text/") || file.type === "application/json") {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * Validate attachment request
   */
  private validateAttachmentRequest(request: AttachmentRequest): void {
    if (!request.type) {
      throw new Error("Attachment type cannot be empty");
    }

    if (!request.content) {
      throw new Error("Attachment content cannot be empty");
    }

    // Check MIME type support
    const mimeType = request.metadata?.mimeType;
    if (mimeType && !this.supportedTypes.has(mimeType)) {
      console.warn(`Unsupported MIME type: ${mimeType}`);
    }

    // Check file size limit (10MB)
    const size = request.metadata?.size;
    if (size && size > 10 * 1024 * 1024) {
      throw new Error("File size exceeds limit (10MB)");
    }
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(request: AttachmentRequest): string {
    const contentHash =
      typeof request.content === "string"
        ? request.content.substring(0, 50)
        : request.content.toString().substring(0, 50);

    return `${request.type}_${contentHash}_${request.metadata?.name || ""}_${request.metadata?.size || 0}`;
  }

  /**
   * Add to cache
   */
  private addToCache(key: string, result: AttachmentResult): void {
    // If the cache is full, delete the oldest entry
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, result);
  }

  /**
   * Generate attachment ID
   */
  private generateAttachmentId(): string {
    return `attachment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Format file size
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}
