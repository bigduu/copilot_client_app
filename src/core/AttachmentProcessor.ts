import {
  AttachmentProcessor as IAttachmentProcessor,
} from '../interfaces/chat-manager';
import {
  OperationResult,
  Attachment,
  AttachmentRequest,
  AttachmentResult
} from '../types/unified-chat';

/**
 * 附件处理器
 * 处理图像、文件等附件的预处理和流程集成
 */
export class AttachmentProcessor implements IAttachmentProcessor {
  private initialized = false;
  private processingQueue = new Map<string, Promise<AttachmentResult>>();
  private cache = new Map<string, AttachmentResult>();
  private maxCacheSize = 100;
  private supportedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/json']);

  constructor() {}

  /**
   * 批量处理附件
   */
  async processAttachments(attachments: Attachment[]): Promise<OperationResult<AttachmentResult[]>> {
    try {
      if (!this.initialized) {
        throw new Error('AttachmentProcessor 未初始化');
      }

      if (!attachments || attachments.length === 0) {
        return {
          success: true,
          data: [],
          message: '没有附件需要处理'
        };
      }

      const results: AttachmentResult[] = [];
      const errors: string[] = [];

      // 并行处理所有附件
      await Promise.allSettled(
        attachments.map(async (attachment) => {
          try {
            const request: AttachmentRequest = {
              type: attachment.type as 'image' | 'file' | 'url',
              content: attachment.url,
              metadata: {
                name: attachment.name,
                size: attachment.size,
                mimeType: attachment.mimeType
              }
            };

            const result = await this.processAttachment(request);
            if (result.success && result.data) {
              results.push(result.data);
            } else {
              errors.push(`处理附件 ${attachment.name} 失败: ${result.error || '未知错误'}`);
            }
          } catch (error) {
            errors.push(`处理附件 ${attachment.name} 异常: ${error instanceof Error ? error.message : String(error)}`);
          }
        })
      );

      if (errors.length > 0 && results.length === 0) {
        return {
          success: false,
          error: errors.join('; '),
          message: '所有附件处理失败'
        };
      }

      return {
        success: true,
        data: results,
        message: `成功处理 ${results.length} 个附件${errors.length > 0 ? `，${errors.length} 个失败` : ''}`
      };
    } catch (error) {
      console.error('批量处理附件失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '批量处理附件失败'
      };
    }
  }

  /**
   * 处理单个附件
   */
  async processAttachment(request: AttachmentRequest): Promise<OperationResult<AttachmentResult>> {
    try {
      if (!this.initialized) {
        throw new Error('AttachmentProcessor 未初始化');
      }

      // 生成缓存键
      const cacheKey = this.generateCacheKey(request);
      
      // 检查缓存
      if (this.cache.has(cacheKey)) {
        const cachedResult = this.cache.get(cacheKey)!;
        return {
          success: true,
          data: cachedResult,
          message: '从缓存获取处理结果'
        };
      }

      // 检查是否正在处理
      if (this.processingQueue.has(cacheKey)) {
        const result = await this.processingQueue.get(cacheKey)!;
        return {
          success: true,
          data: result,
          message: '等待处理队列完成'
        };
      }

      // 开始处理
      const processingPromise = this.performProcessing(request);
      this.processingQueue.set(cacheKey, processingPromise);

      try {
        const result = await processingPromise;
        
        // 缓存结果
        this.addToCache(cacheKey, result);
        
        return {
          success: true,
          data: result,
          message: '附件处理完成'
        };
      } finally {
        // 从处理队列移除
        this.processingQueue.delete(cacheKey);
      }
    } catch (error) {
      console.error('处理附件失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '附件处理失败'
      };
    }
  }

  /**
   * 获取处理结果
   */
  async getResult(attachmentId: string): Promise<OperationResult<any>> {
    try {
      // 从缓存中查找结果
      for (const [key, result] of this.cache.entries()) {
        if (result.attachment.id === attachmentId) {
          return {
            success: true,
            data: result,
            message: '找到附件处理结果'
          };
        }
      }

      return {
        success: false,
        error: '未找到附件处理结果',
        message: `附件 ${attachmentId} 的处理结果不存在`
      };
    } catch (error) {
      console.error('获取处理结果失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '获取处理结果失败'
      };
    }
  }

  /**
   * 合并附件摘要到内容中
   */
  mergeAttachmentSummaries(content: string, results: AttachmentResult[]): string {
    try {
      if (!results || results.length === 0) {
        return content;
      }

      const summaries = results
        .filter(result => result.summary && result.summary.trim())
        .map(result => `[附件: ${result.attachment.name}]\n${result.summary}`)
        .join('\n\n');

      if (!summaries) {
        return content;
      }

      // 如果内容为空，只返回摘要
      if (!content || !content.trim()) {
        return summaries;
      }

      // 将摘要添加到内容前面
      return `${summaries}\n\n${content}`;
    } catch (error) {
      console.error('合并附件摘要失败:', error);
      return content;
    }
  }

  /**
   * 生成附件提示词
   */
  generateAttachmentPrompt(attachment: Attachment): string {
    try {
      const type = attachment.type;
      const name = attachment.name;
      const size = this.formatFileSize(attachment.size);

      let prompt = `处理附件：${name} (${size})`;

      switch (type) {
        case 'image':
          prompt += `\n这是一张图片，请分析图片内容并提供详细描述。`;
          break;
        case 'file':
          if (attachment.mimeType.includes('text')) {
            prompt += `\n这是一个文本文件，请分析文件内容并提供摘要。`;
          } else {
            prompt += `\n这是一个文件，类型：${attachment.mimeType}。`;
          }
          break;
        case 'screenshot':
          prompt += `\n这是一张截图，请分析截图内容并提供详细描述。`;
          break;
        default:
          prompt += `\n请分析此附件的内容。`;
      }

      return prompt;
    } catch (error) {
      console.error('生成附件提示词失败:', error);
      return `处理附件：${attachment.name}`;
    }
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 清理缓存和队列
      this.cache.clear();
      this.processingQueue.clear();

      this.initialized = true;
      console.log('AttachmentProcessor 初始化完成');
    } catch (error) {
      throw new Error(`AttachmentProcessor 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    try {
      // 等待所有处理完成
      if (this.processingQueue.size > 0) {
        await Promise.allSettled(Array.from(this.processingQueue.values()));
      }

      // 清理资源
      this.cache.clear();
      this.processingQueue.clear();
      
      this.initialized = false;
      console.log('AttachmentProcessor 已销毁');
    } catch (error) {
      console.error('AttachmentProcessor 销毁失败:', error);
    }
  }

  /**
   * 执行实际处理
   */
  private async performProcessing(request: AttachmentRequest): Promise<AttachmentResult> {
    const startTime = Date.now();

    try {
      // 验证附件类型
      this.validateAttachmentRequest(request);

      let summary = '';
      let originalContent = '';

      switch (request.type) {
        case 'image':
          ({ summary, originalContent } = await this.processImage(request));
          break;
        case 'file':
          ({ summary, originalContent } = await this.processFile(request));
          break;
        case 'url':
          ({ summary, originalContent } = await this.processUrl(request));
          break;
        default:
          throw new Error(`不支持的附件类型: ${request.type}`);
      }

      const processingTime = Date.now() - startTime;

      // 创建附件对象
      const attachment: Attachment = {
        id: this.generateAttachmentId(),
        type: request.type as 'image' | 'file' | 'screenshot',
        url: typeof request.content === 'string' ? request.content : '',
        name: request.metadata?.name || `附件_${Date.now()}`,
        size: request.metadata?.size || 0,
        mimeType: request.metadata?.mimeType || 'application/octet-stream'
      };

      return {
        attachment,
        summary,
        originalContent,
        processingTime
      };
    } catch (error) {
      throw new Error(`附件处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理图片
   */
  private async processImage(request: AttachmentRequest): Promise<{ summary: string; originalContent: string }> {
    try {
      // 这里应该调用图像分析服务，暂时返回模拟结果
      const summary = `图片分析结果：${request.metadata?.name || '未知图片'}`;
      const originalContent = typeof request.content === 'string' ? request.content : '[图片内容]';

      return { summary, originalContent };
    } catch (error) {
      throw new Error(`图片处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理文件
   */
  private async processFile(request: AttachmentRequest): Promise<{ summary: string; originalContent: string }> {
    try {
      let originalContent = '';
      
      if (typeof request.content === 'string') {
        originalContent = request.content;
      } else if (request.content instanceof File) {
        originalContent = await this.readFileContent(request.content);
      } else {
        originalContent = '[文件内容]';
      }

      const summary = `文件摘要：${request.metadata?.name || '未知文件'} - ${originalContent.substring(0, 200)}${originalContent.length > 200 ? '...' : ''}`;

      return { summary, originalContent };
    } catch (error) {
      throw new Error(`文件处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 处理URL
   */
  private async processUrl(request: AttachmentRequest): Promise<{ summary: string; originalContent: string }> {
    try {
      const url = typeof request.content === 'string' ? request.content : '';
      const summary = `URL内容摘要：${url}`;
      const originalContent = url;

      return { summary, originalContent };
    } catch (error) {
      throw new Error(`URL处理失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 读取文件内容
   */
  private async readFileContent(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        resolve(e.target?.result as string || '');
      };
      
      reader.onerror = () => {
        reject(new Error('读取文件失败'));
      };

      // 根据文件类型选择读取方式
      if (file.type.startsWith('text/') || file.type === 'application/json') {
        reader.readAsText(file);
      } else {
        reader.readAsDataURL(file);
      }
    });
  }

  /**
   * 验证附件请求
   */
  private validateAttachmentRequest(request: AttachmentRequest): void {
    if (!request.type) {
      throw new Error('附件类型不能为空');
    }

    if (!request.content) {
      throw new Error('附件内容不能为空');
    }

    // 检查MIME类型支持
    const mimeType = request.metadata?.mimeType;
    if (mimeType && !this.supportedTypes.has(mimeType)) {
      console.warn(`不支持的MIME类型: ${mimeType}`);
    }

    // 检查文件大小限制 (10MB)
    const size = request.metadata?.size;
    if (size && size > 10 * 1024 * 1024) {
      throw new Error('文件大小超过限制 (10MB)');
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: AttachmentRequest): string {
    const contentHash = typeof request.content === 'string' 
      ? request.content.substring(0, 50)
      : request.content.toString().substring(0, 50);
    
    return `${request.type}_${contentHash}_${request.metadata?.name || ''}_${request.metadata?.size || 0}`;
  }

  /**
   * 添加到缓存
   */
  private addToCache(key: string, result: AttachmentResult): void {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, result);
  }

  /**
   * 生成附件ID
   */
  private generateAttachmentId(): string {
    return `attachment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 格式化文件大小
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}