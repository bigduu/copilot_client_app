import { Message, MessageImage, createContentWithImages } from '../types/chat';
import { ImageFile } from '../utils/imageUtils';
import { ToolCallProcessor } from './ToolCallProcessor';
import { AIParameterParser } from './AIParameterParser';

/**
 * Convert ImageFile to MessageImage format
 */
const convertImageFileToMessageImage = (imageFile: ImageFile): MessageImage => {
  return {
    id: imageFile.id,
    base64: imageFile.base64,
    name: imageFile.name,
    size: imageFile.size,
    type: imageFile.type,
    width: undefined, // Could be extracted from image if needed
    height: undefined, // Could be extracted from image if needed
  };
};

/**
 * Message handler for different types of messages
 * Breaks down the large sendMessage function into smaller, focused methods
 */
export class MessageHandler {
  constructor(
    private chatId: string,
    private addMessage: (message: Message) => void,
    private updateMessage: (messageId: string, updates: Partial<Message>) => void,
    private initiateAIResponse: (chatId: string, content: string) => Promise<void>,
    private triggerAIResponseOnly: (chatId: string) => Promise<void>,
    private autoUpdateChatTitle: (chatId: string) => Promise<void>
  ) {}

  /**
   * Handle approval request messages with streaming response
   */
  async handleApprovalRequest(content: string, images?: ImageFile[]): Promise<void> {
    console.log("[MessageHandler] Handling approval request:", content);

    // Add user message first
    const userMessage: Message = {
      role: "user",
      content,
      id: crypto.randomUUID(),
      images: images ? images.map(convertImageFileToMessageImage) : undefined,
    };
    this.addMessage(userMessage);

    // Create assistant message for streaming updates
    const assistantMessageId = crypto.randomUUID();

    const assistantMessage: Message = {
      role: "assistant",
      content: '',
      id: assistantMessageId,
    };
    this.addMessage(assistantMessage);

    // Process approval request with streaming
    try {
      const toolProcessor = ToolCallProcessor.getInstance();

      // Use streaming version of approval processing
      await toolProcessor.processApprovalRequestWithStreaming(
        content,
        (streamingContent: string, _isComplete: boolean) => {
          // Update the assistant message with streaming content
          this.updateMessage(assistantMessageId, { content: streamingContent });
        },
        AIParameterParser.createSendLLMRequestFunction()
      );

      // Auto-update chat title after approval processing
      setTimeout(() => this.autoUpdateChatTitle(this.chatId), 500);

    } catch (error) {
      console.error("Approval request failed:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Approval processing failed: ${error}`,
        id: assistantMessageId,
      };
      this.addMessage(errorMessage);
    }
  }

  /**
   * Handle tool call messages
   */
  async handleToolCall(content: string, images?: ImageFile[]): Promise<void> {
    const toolProcessor = ToolCallProcessor.getInstance();
    const toolCall = toolProcessor.parseToolCall(content);
    
    if (!toolCall) {
      console.error("[MessageHandler] Failed to parse tool call");
      return;
    }

    console.log("[MessageHandler] Handling tool call:", toolCall);

    // Add user message first
    const userMessage: Message = {
      role: "user",
      content,
      id: crypto.randomUUID(),
      images: images ? images.map(convertImageFileToMessageImage) : undefined,
    };
    this.addMessage(userMessage);

    // Process tool call
    try {
      const result = await toolProcessor.processToolCall(
        toolCall,
        undefined,
        AIParameterParser.createSendLLMRequestFunction()
      );

      // Add assistant response
      const assistantMessage: Message = {
        role: "assistant",
        content: result.content,
        id: crypto.randomUUID(),
      };
      this.addMessage(assistantMessage);

      // Auto-update chat title after tool call completion
      setTimeout(() => this.autoUpdateChatTitle(this.chatId), 500);

    } catch (error) {
      console.error("Tool call failed:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: `Tool execution failed: ${error}`,
        id: crypto.randomUUID(),
      };
      this.addMessage(errorMessage);
    }
  }

  /**
   * Handle regular messages with images
   */
  async handleMessageWithImages(content: string, images: ImageFile[]): Promise<void> {
    console.log("[MessageHandler] Handling message with images");

    // Handle message with images - custom implementation
    const messageImages = images.map(convertImageFileToMessageImage);
    const userMessage: Message = {
      role: "user",
      content: createContentWithImages(content, messageImages),
      id: crypto.randomUUID(),
      images: messageImages, // Keep for backward compatibility
    };
    this.addMessage(userMessage);

    // TODO: Implement AI response with image support
    // For now, we'll trigger AI response without creating duplicate user message
    await this.triggerAIResponseOnly(this.chatId);

    // Auto-update chat title after AI response (with delay to ensure response is complete)
    setTimeout(() => this.autoUpdateChatTitle(this.chatId), 2000);
  }

  /**
   * Handle regular text messages
   */
  async handleRegularMessage(content: string): Promise<void> {
    console.log("[MessageHandler] Handling regular message");

    // Regular message without images - use store's AI response handling
    await this.initiateAIResponse(this.chatId, content);

    // Auto-update chat title after AI response (with delay to ensure response is complete)
    setTimeout(() => this.autoUpdateChatTitle(this.chatId), 2000);
  }

  /**
   * Main message handling entry point
   */
  async handleMessage(content: string, images?: ImageFile[]): Promise<void> {
    const toolProcessor = ToolCallProcessor.getInstance();
    const isToolCall = toolProcessor.isToolCall(content);
    const isApprovalRequest = toolProcessor.isApprovalRequest(content);

    if (isApprovalRequest) {
      await this.handleApprovalRequest(content, images);
    } else if (isToolCall) {
      await this.handleToolCall(content, images);
    } else if (images && images.length > 0) {
      await this.handleMessageWithImages(content, images);
    } else {
      await this.handleRegularMessage(content);
    }
  }
}
