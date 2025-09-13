import {
  ErrorHandler as IErrorHandler,
} from '../interfaces/chat-manager';
import {
  OperationResult
} from '../types/unified-chat';

/**
 * Error Type Enum
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
 * Extended Error Class
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
 * Retry Configuration
 */
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  exponentialBase: number;
  jitter: boolean;
}

/**
 * Error Handler
 * Unified error handling and recovery mechanism
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
   * Process and throw error
   */
  async processError(error: Error): Promise<never> {
    try {
      const enrichedError = this.enrichError(error);
      
      // Log error
      console.error('Handle error:', enrichedError);
      
      // Notify subscribers
      this.notifyErrorSubscribers(enrichedError);
      
      // Determine handling based on error type
      if (enrichedError instanceof ExtendedError) {
        await this.handleErrorByType(enrichedError);
      }
      
      throw enrichedError;
    } catch (err) {
      // Ensure an error is always thrown
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Execute operation with backoff and retry
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
        
        // If it's the last attempt, throw the error directly
        if (attempt === retries) {
          throw this.enrichError(lastError);
        }

        // Calculate delay time
        const delay = this.calculateDelay(attempt);
        
        console.warn(`Operation failed, retrying for the ${attempt + 1} time, retrying after ${delay}ms:`, lastError.message);
        
        // Wait for delay
        await this.sleep(delay);
      }
    }

    // Should not be reached in theory
    throw this.enrichError(lastError || new Error('Retry failed'));
  }

  /**
   * Rollback and notify
   */
  async rollbackAndNotify(error: Error): Promise<never> {
    try {
      const enrichedError = this.enrichError(error);
      
      console.error('Executing rollback operation:', enrichedError);
      
      // Notify subscribers
      this.notifyErrorSubscribers(enrichedError);
      
      // Specific rollback logic can be executed here
      // e.g., clean up temporary data, restore state, etc.
      
      throw enrichedError;
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  /**
   * Enrich error information
   */
  enrichError(error: Error): Error {
    try {
      // If it is already an extended error, return directly
      if (error instanceof ExtendedError) {
        return error;
      }

      // Determine error type
      const errorType = this.determineErrorType(error);
      
      // Generate error code
      const errorCode = this.generateErrorCode(error, errorType);
      
      // Collect context information
      const context = this.collectErrorContext(error);

      return new ExtendedError(
        error.message,
        errorType,
        errorCode,
        context
      );
    } catch (enrichError) {
      console.error('Failed to enrich error information:', enrichError);
      return error; // Return original error
    }
  }

  /**
   * Create error result
   */
  createErrorResult(message: string): OperationResult<any> {
    return {
      success: false,
      error: message,
      message: 'Operation failed',
      errorCode: 'OPERATION_FAILED'
    };
  }

  /**
   * Handle error
   */
  handleError(error: any, operation: string): OperationResult<any> {
    try {
      const enrichedError = this.enrichError(
        error instanceof Error ? error : new Error(String(error))
      );

      const result: OperationResult<any> = {
        success: false,
        error: enrichedError.message,
        message: `Operation failed: ${operation}`,
        errorCode: enrichedError instanceof ExtendedError ? enrichedError.code : 'UNKNOWN_ERROR'
      };

      // Log error
      console.error(`Operation ${operation} failed:`, enrichedError);
      
      // Notify subscribers
      this.notifyErrorSubscribers(enrichedError);

      return result;
    } catch (handlingError) {
      console.error('Exception occurred while handling error:', handlingError);
      
      return {
        success: false,
        error: 'Failed to handle error',
        message: `Operation failed: ${operation}`,
        errorCode: 'ERROR_HANDLING_FAILED'
      };
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
      // Set up global error handlers
      this.setupGlobalErrorHandlers();
      
      this.initialized = true;
      console.log('ErrorHandler initialized successfully');
    } catch (error) {
      throw new Error(`ErrorHandler initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    try {
      // Clean up subscribers
      this.errorSubscribers.clear();
      
      // Remove global error handlers
      this.removeGlobalErrorHandlers();
      
      this.initialized = false;
      console.log('ErrorHandler has been disposed');
    } catch (error) {
      console.error('ErrorHandler disposal failed:', error);
    }
  }

  /**
   * Subscribe to error events
   */
  subscribe(callback: (error: Error) => void): () => void {
    this.errorSubscribers.add(callback);
    
    return () => {
      this.errorSubscribers.delete(callback);
    };
  }

  /**
   * Set Retry Configuration
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Get Retry Configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }

  /**
   * Determine error type
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
   * Generate error code
   */
  private generateErrorCode(error: Error, type: ErrorType): string {
    const timestamp = Date.now().toString(36);
    const hash = this.simpleHash(error.message);
    return `${type}_${hash}_${timestamp}`;
  }

  /**
   * Collect error context
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
   * Handle by error type
   */
  private async handleErrorByType(error: ExtendedError): Promise<void> {
    switch (error.type) {
      case ErrorType.NETWORK:
        // Network error handling
        console.warn('Network error, may need to retry');
        break;
      case ErrorType.VALIDATION:
        // Validation error handling
        console.warn('Validation error, check input data');
        break;
      case ErrorType.AUTHENTICATION:
        // Authentication error handling
        console.warn('Authentication error, may need to log in again');
        break;
      case ErrorType.PERMISSION:
        // Permission error handling
        console.warn('Insufficient permissions, cannot perform operation');
        break;
      case ErrorType.SYSTEM:
        // System error handling
        console.warn('System error, contact administrator');
        break;
      default:
        console.warn('Unknown error type');
    }
  }

  /**
   * Notify error subscribers
   */
  private notifyErrorSubscribers(error: Error): void {
    for (const subscriber of this.errorSubscribers) {
      try {
        subscriber(error);
      } catch (subscriberError) {
        console.error('Error subscriber execution failed:', subscriberError);
      }
    }
  }

  /**
   * Calculate delay time
   */
  private calculateDelay(attempt: number): number {
    let delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.exponentialBase, attempt);
    
    // Limit maximum delay
    delay = Math.min(delay, this.retryConfig.maxDelay);
    
    // Add jitter
    if (this.retryConfig.jitter) {
      delay += Math.random() * 1000;
    }
    
    return Math.floor(delay);
  }

  /**
   * Sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Simple hash function
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
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    if (typeof window !== 'undefined') {
      // Handle uncaught errors
      window.addEventListener('error', (event) => {
        const error = event.error || new Error(event.message);
        this.handleError(error, 'global_error');
      });

      // Handle unhandled Promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        this.handleError(error, 'unhandled_rejection');
      });
    }
  }

  /**
   * Remove global error handlers
   */
  private removeGlobalErrorHandlers(): void {
    // In a real application, the previously added event listeners should be removed here
    // but since we can't directly reference the previous handler functions, this is just a placeholder
  }
}
