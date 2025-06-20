import {
  ErrorHandler as IErrorHandler,
} from '../interfaces/chat-manager';
import {
  OperationResult
} from '../types/unified-chat';

/**
 * 错误类型枚举
 */
enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  PERMISSION = 'PERMISSION',
  SYSTEM = 'SYSTEM',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 扩展的错误类
 */
class ExtendedError extends Error {
  public readonly type: ErrorType;
  public readonly code: string;
  public readonly context?: any;
  public readonly timestamp: number;
  public readonly stack?: string;

  constructor(
    message: string,
    type: ErrorType = ErrorType.UNKNOWN,
    code?: string,
    context?: any
  ) {
    super(message);
    this.name = 'ExtendedError';
    this.type = type;
    this.code = code || 'UNKNOWN_ERROR';
    this.context = context;
    this.timestamp = Date.now();
  }
}

/**
 * 重试配置
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

/**
 * 错误处理器
 * 统一的错误处理和恢复机制
 */
export class ErrorHandler implements IErrorHandler {
  private initialized = false;
  private retryConfig: RetryConfig;
  private errorSubscribers = new Set<(error: Error) => void>();

  constructor() {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      exponentialBase: 2,
      jitter: true
    };
  }

  /**
   * 处理错误并抛出
   */
  async processError(error: Error): Promise<never> {
    try {
      const enrichedError = this.enrichError(error);
      
      // 记录错误
      console.error('处理错误:', enrichedError);
      
      // 通知订阅者
      this.notifyErrorSubscribers(enrichedError);
      
      // 根据错误类型决定处理方式
      if (enrichedError instanceof ExtendedError) {
        await this.handleErrorByType(enrichedError);
      }
      
      throw enrichedError;
    } catch (err) {
      // 确保总是抛出错误
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * 带退避重试的操作执行
   */
  async retryWithBackoff(
    operation: () => Promise<any>,
    maxRetries?: number
  ): Promise<any> {
    const retries = maxRetries !== undefined ? maxRetries : this.retryConfig.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // 如果是最后一次尝试，直接抛出错误
        if (attempt === retries) {
          throw this.enrichError(lastError);
        }

        // 计算延迟时间
        const delay = this.calculateDelay(attempt);
        
        console.warn(`操作失败，第 ${attempt + 1} 次重试，${delay}ms 后重试:`, lastError.message);
        
        // 等待延迟
        await this.sleep(delay);
      }
    }

    // 理论上不应该到达这里
    throw this.enrichError(lastError || new Error('重试失败'));
  }

  /**
   * 回滚并通知
   */
  async rollbackAndNotify(error: Error): Promise<never> {
    try {
      const enrichedError = this.enrichError(error);
      
      console.error('执行回滚操作:', enrichedError);
      
      // 通知订阅者
      this.notifyErrorSubscribers(enrichedError);
      
      // 这里可以执行具体的回滚逻辑
      // 例如：清理临时数据、恢复状态等
      
      throw enrichedError;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * 丰富错误信息
   */
  enrichError(error: Error): Error {
    try {
      // 如果已经是扩展错误，直接返回
      if (error instanceof ExtendedError) {
        return error;
      }

      // 确定错误类型
      const errorType = this.determineErrorType(error);
      
      // 生成错误代码
      const errorCode = this.generateErrorCode(error, errorType);
      
      // 收集上下文信息
      const context = this.collectErrorContext(error);

      return new ExtendedError(
        error.message,
        errorType,
        errorCode,
        context
      );
    } catch (enrichError) {
      console.error('丰富错误信息失败:', enrichError);
      return error; // 返回原始错误
    }
  }

  /**
   * 创建错误结果
   */
  createErrorResult(message: string): OperationResult<any> {
    return {
      success: false,
      error: message,
      message: '操作失败',
      errorCode: 'OPERATION_FAILED'
    };
  }

  /**
   * 处理错误
   */
  handleError(error: any, operation: string): OperationResult<any> {
    try {
      const enrichedError = this.enrichError(
        error instanceof Error ? error : new Error(String(error))
      );

      const result: OperationResult<any> = {
        success: false,
        error: enrichedError.message,
        message: `操作失败: ${operation}`,
        errorCode: enrichedError instanceof ExtendedError ? enrichedError.code : 'UNKNOWN_ERROR'
      };

      // 记录错误
      console.error(`操作 ${operation} 失败:`, enrichedError);
      
      // 通知订阅者
      this.notifyErrorSubscribers(enrichedError);

      return result;
    } catch (handlingError) {
      console.error('处理错误时发生异常:', handlingError);
      
      return {
        success: false,
        error: '错误处理失败',
        message: `操作失败: ${operation}`,
        errorCode: 'ERROR_HANDLING_FAILED'
      };
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
      // 设置全局错误处理器
      this.setupGlobalErrorHandlers();
      
      this.initialized = true;
      console.log('ErrorHandler 初始化完成');
    } catch (error) {
      throw new Error(`ErrorHandler 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    try {
      // 清理订阅者
      this.errorSubscribers.clear();
      
      // 移除全局错误处理器
      this.removeGlobalErrorHandlers();
      
      this.initialized = false;
      console.log('ErrorHandler 已销毁');
    } catch (error) {
      console.error('ErrorHandler 销毁失败:', error);
    }
  }

  /**
   * 订阅错误事件
   */
  subscribe(callback: (error: Error) => void): () => void {
    this.errorSubscribers.add(callback);
    
    return () => {
      this.errorSubscribers.delete(callback);
    };
  }

  /**
   * 设置重试配置
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * 获取重试配置
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * 确定错误类型
   */
  private determineErrorType(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return ErrorType.NETWORK;
    }
    
    if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
      return ErrorType.VALIDATION;
    }
    
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return ErrorType.AUTHENTICATION;
    }
    
    if (message.includes('permission') || message.includes('access denied')) {
      return ErrorType.PERMISSION;
    }
    
    if (message.includes('system') || message.includes('internal')) {
      return ErrorType.SYSTEM;
    }
    
    return ErrorType.UNKNOWN;
  }

  /**
   * 生成错误代码
   */
  private generateErrorCode(error: Error, type: ErrorType): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(error.message);
    return `${type}_${hash}_${timestamp}`;
  }

  /**
   * 收集错误上下文
   */
  private collectErrorContext(error: Error): any {
    return {
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      stack: error.stack,
      name: error.name
    };
  }

  /**
   * 根据错误类型处理
   */
  private async handleErrorByType(error: ExtendedError): Promise<void> {
    switch (error.type) {
      case ErrorType.NETWORK:
        // 网络错误处理
        console.warn('网络错误，可能需要重试');
        break;
      case ErrorType.VALIDATION:
        // 验证错误处理
        console.warn('验证错误，检查输入数据');
        break;
      case ErrorType.AUTHENTICATION:
        // 认证错误处理
        console.warn('认证错误，可能需要重新登录');
        break;
      case ErrorType.PERMISSION:
        // 权限错误处理
        console.warn('权限不足，无法执行操作');
        break;
      case ErrorType.SYSTEM:
        // 系统错误处理
        console.warn('系统错误，联系管理员');
        break;
      default:
        console.warn('未知错误类型');
    }
  }

  /**
   * 通知错误订阅者
   */
  private notifyErrorSubscribers(error: Error): void {
    for (const subscriber of this.errorSubscribers) {
      try {
        subscriber(error);
      } catch (subscriberError) {
        console.error('错误订阅者执行失败:', subscriberError);
      }
    }
  }

  /**
   * 计算延迟时间
   */
  private calculateDelay(attempt: number): number {
    let delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.exponentialBase, attempt);
    
    // 限制最大延迟
    delay = Math.min(delay, this.retryConfig.maxDelay);
    
    // 添加抖动
    if (this.retryConfig.jitter) {
      delay += Math.random() * 1000;
    }
    
    return Math.floor(delay);
  }

  /**
   * 睡眠函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 设置全局错误处理器
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window !== 'undefined') {
      // 处理未捕获的错误
      window.addEventListener('error', (event) => {
        const error = event.error || new Error(event.message);
        this.handleError(error, 'global_error');
      });

      // 处理未捕获的Promise拒绝
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        this.handleError(error, 'unhandled_rejection');
      });
    }
  }

  /**
   * 移除全局错误处理器
   */
  private removeGlobalErrorHandlers(): void {
    // 在实际应用中，这里应该移除之前添加的事件监听器
    // 但由于我们不能直接引用之前的处理函数，这里只是占位
  }
}