import { UnifiedChatManager } from './UnifiedChatManager';
import { StateManager } from './StateManager';
import { AttachmentProcessor } from './AttachmentProcessor';
import { ApprovalManager } from './ApprovalManager';
import { ErrorHandler } from './ErrorHandler';
import { PerformanceMonitor } from './PerformanceMonitor';
import { ChatFlowController } from '../interfaces/chat-manager';
import { CreateChatOptions } from '../types/unified-chat';

/**
 * 配置预设类型
 */
export interface ChatManagerConfig {
  enablePerformanceMonitoring?: boolean;
  enableAutoApproval?: boolean;
  maxConcurrentOperations?: number;
  defaultErrorRetryCount?: number;
  attachmentMaxSize?: number;
  persistenceEnabled?: boolean;
}

/**
 * 预定义配置场景
 */
export enum ConfigurationScenario {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TESTING = 'testing',
  HIGH_PERFORMANCE = 'high_performance',
  SECURE = 'secure'
}

/**
 * ChatManager工厂类
 * 提供预配置的ChatManager实例创建，简化初始化过程
 */
export class ChatManagerFactory {
  
  /**
   * 根据场景创建预配置的ChatManager实例
   */
  static createForScenario(scenario: ConfigurationScenario): UnifiedChatManager {
    const config = this.getConfigForScenario(scenario);
    return this.createWithConfig(config);
  }

  /**
   * 使用自定义配置创建ChatManager实例
   */
  static createWithConfig(config: ChatManagerConfig): UnifiedChatManager {
    // 创建状态管理器
    const stateManager = new (StateManager as any)({
      maxConcurrentOperations: config.maxConcurrentOperations || 10,
      persistenceEnabled: config.persistenceEnabled || false
    });

    // 创建流控制器的默认实现
    const flowController: ChatFlowController = {
      async initialize() {},
      async dispose() {},
      async initiateChat(options: CreateChatOptions) {
        return {
          chatId: crypto.randomUUID(),
          status: 'created' as const,
          chat: {
            id: crypto.randomUUID(),
            title: options.title || 'New Chat',
            systemPrompt: options.systemPrompt || '',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date()
          } as any
        };
      },
      async sendMessage(chatId: string, content: string) {
        return {
          messageId: crypto.randomUUID(),
          chatId,
          status: 'sent' as const,
          message: {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content,
            timestamp: new Date()
          } as any
        };
      },
      async sendMessageWithAttachments(chatId: string, content: string, attachments: any[]) {
        return {
          messageId: crypto.randomUUID(),
          chatId,
          status: 'sent' as const,
          message: {
            id: crypto.randomUUID(),
            role: 'user' as const,
            content,
            timestamp: new Date(),
            attachments
          } as any
        };
      },
      async handleToolCall(chatId: string, toolCall: any) {
        return {
          toolId: crypto.randomUUID(),
          status: 'pending' as const,
          result: null
        };
      },
      async processAIResponse(chatId: string, messages: any[]) {
        return {
          responseId: crypto.randomUUID(),
          status: 'completed' as const,
          content: '',
          processingTime: 0
        };
      },
      async handleApprovalFlow(chatId: string, action: any) {
        return {
          approved: config.enableAutoApproval || false,
          automatic: config.enableAutoApproval || false,
          timestamp: Date.now()
        };
      },
      async startFlow(chatId: string, flowType: string) {
        return { success: true };
      },
      async pauseFlow(chatId: string) {
        return { success: true };
      },
      async resumeFlow(chatId: string) {
        return { success: true };
      },
      async stopFlow(chatId: string) {
        return { success: true };
      },
      subscribe(callback: (event: any) => void) {
        return () => {};
      }
    };

    // 创建附件处理器
    const attachmentProcessor = new (AttachmentProcessor as any)({
      maxSize: config.attachmentMaxSize || 10 * 1024 * 1024, // 10MB
      enablePreview: true
    });

    // 创建审批管理器
    const approvalManager = new (ApprovalManager as any)({
      autoApproval: config.enableAutoApproval || false,
      defaultTimeout: 30000
    });

    // 创建错误处理器
    const errorHandler = new (ErrorHandler as any)({
      retryCount: config.defaultErrorRetryCount || 3,
      enableLogging: true
    });

    // 创建性能监控器
    const performanceMonitor = new (PerformanceMonitor as any)({
      enabled: config.enablePerformanceMonitoring || true,
      sampleRate: 1.0
    });

    return new UnifiedChatManager(
      stateManager,
      flowController,
      attachmentProcessor,
      approvalManager,
      errorHandler,
      performanceMonitor
    );
  }

  /**
   * 创建开发环境的ChatManager实例
   */
  static createForDevelopment(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.DEVELOPMENT);
  }

  /**
   * 创建生产环境的ChatManager实例
   */
  static createForProduction(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.PRODUCTION);
  }

  /**
   * 创建测试环境的ChatManager实例
   */
  static createForTesting(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.TESTING);
  }

  /**
   * 创建高性能场景的ChatManager实例
   */
  static createForHighPerformance(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.HIGH_PERFORMANCE);
  }

  /**
   * 创建安全场景的ChatManager实例
   */
  static createForSecure(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.SECURE);
  }

  /**
   * 根据场景获取配置
   */
  private static getConfigForScenario(scenario: ConfigurationScenario): ChatManagerConfig {
    switch (scenario) {
      case ConfigurationScenario.DEVELOPMENT:
        return {
          enablePerformanceMonitoring: true,
          enableAutoApproval: true,
          maxConcurrentOperations: 5,
          defaultErrorRetryCount: 1,
          attachmentMaxSize: 5 * 1024 * 1024, // 5MB
          persistenceEnabled: false
        };

      case ConfigurationScenario.PRODUCTION:
        return {
          enablePerformanceMonitoring: true,
          enableAutoApproval: false,
          maxConcurrentOperations: 20,
          defaultErrorRetryCount: 3,
          attachmentMaxSize: 50 * 1024 * 1024, // 50MB
          persistenceEnabled: true
        };

      case ConfigurationScenario.TESTING:
        return {
          enablePerformanceMonitoring: false,
          enableAutoApproval: true,
          maxConcurrentOperations: 1,
          defaultErrorRetryCount: 0,
          attachmentMaxSize: 1 * 1024 * 1024, // 1MB
          persistenceEnabled: false
        };

      case ConfigurationScenario.HIGH_PERFORMANCE:
        return {
          enablePerformanceMonitoring: true,
          enableAutoApproval: true,
          maxConcurrentOperations: 50,
          defaultErrorRetryCount: 1,
          attachmentMaxSize: 100 * 1024 * 1024, // 100MB
          persistenceEnabled: true
        };

      case ConfigurationScenario.SECURE:
        return {
          enablePerformanceMonitoring: true,
          enableAutoApproval: false,
          maxConcurrentOperations: 10,
          defaultErrorRetryCount: 2,
          attachmentMaxSize: 10 * 1024 * 1024, // 10MB
          persistenceEnabled: true
        };

      default:
        return this.getConfigForScenario(ConfigurationScenario.DEVELOPMENT);
    }
  }

  /**
   * 创建带有默认选项的聊天
   */
  static async createChatWithDefaults(
    manager: UnifiedChatManager,
    title: string,
    options?: Partial<CreateChatOptions>
  ) {
    const defaultOptions: CreateChatOptions = {
      title,
      autoApproval: false,
      model: 'gpt-4',
      ...options
    };

    return await manager.addChat(defaultOptions);
  }
}

/**
 * 便捷创建函数
 */
export const createChatManager = ChatManagerFactory.createForDevelopment;
export const createProductionChatManager = ChatManagerFactory.createForProduction;
export const createTestChatManager = ChatManagerFactory.createForTesting;