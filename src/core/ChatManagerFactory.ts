import { UnifiedChatManager } from './UnifiedChatManager';
import { StateManager } from './StateManager';
import { AttachmentProcessor } from './AttachmentProcessor';
import { ApprovalManager } from './ApprovalManager';
import { ErrorHandler } from './ErrorHandler';
import { PerformanceMonitor } from './PerformanceMonitor';
import { ChatFlowController } from '../interfaces/chat-manager';
import { CreateChatOptions } from '../types/unified-chat';

/**
 * Configuration preset type
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
 * Predefined configuration scenarios
 */
export enum ConfigurationScenario {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TESTING = 'testing',
  HIGH_PERFORMANCE = 'high_performance',
  SECURE = 'secure'
}

/**
 * ChatManager Factory Class
 * Provides creation of pre-configured ChatManager instances to simplify initialization
 */
export class ChatManagerFactory {
  
  /**
   * Create a pre-configured ChatManager instance based on the scenario
   */
  static createForScenario(scenario: ConfigurationScenario): UnifiedChatManager {
    const config = this.getConfigForScenario(scenario);
    return this.createWithConfig(config);
  }

  /**
   * Create a ChatManager instance with custom configuration
   */
  static createWithConfig(config: ChatManagerConfig): UnifiedChatManager {
    // Create state manager
    const stateManager = new (StateManager as any)({
      maxConcurrentOperations: config.maxConcurrentOperations || 10,
      persistenceEnabled: config.persistenceEnabled || false
    });

    // Create default implementation of flow controller
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
      async handleToolCall(_chatId: string, _toolCall: any) {
        return {
          toolId: crypto.randomUUID(),
          status: 'pending' as const,
          result: null
        };
      },
      async processAIResponse(_chatId: string, _messages: any[]) {
        return {
          responseId: crypto.randomUUID(),
          status: 'completed' as const,
          content: '',
          processingTime: 0
        };
      },
      async handleApprovalFlow(_chatId: string, _action: any) {
        return {
          approved: config.enableAutoApproval || false,
          automatic: config.enableAutoApproval || false,
          timestamp: Date.now()
        };
      },
      async startFlow(_chatId: string, _flowType: string) {
        return { success: true };
      },
      async pauseFlow(_chatId: string) {
        return { success: true };
      },
      async resumeFlow(_chatId: string) {
        return { success: true };
      },
      async stopFlow(_chatId: string) {
        return { success: true };
      },
      subscribe(_callback: (event: any) => void) {
        return () => {};
      }
    };

    // Create attachment processor
    const attachmentProcessor = new (AttachmentProcessor as any)({
      maxSize: config.attachmentMaxSize || 10 * 1024 * 1024, // 10MB
      enablePreview: true
    });

    // Create approval manager
    const approvalManager = new (ApprovalManager as any)({
      autoApproval: config.enableAutoApproval || false,
      defaultTimeout: 30000
    });

    // Create error handler
    const errorHandler = new (ErrorHandler as any)({
      retryCount: config.defaultErrorRetryCount || 3,
      enableLogging: true
    });

    // Create performance monitor
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
   * Create a ChatManager instance for the development environment
   */
  static createForDevelopment(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.DEVELOPMENT);
  }

  /**
   * Create a ChatManager instance for the production environment
   */
  static createForProduction(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.PRODUCTION);
  }

  /**
   * Create a ChatManager instance for the test environment
   */
  static createForTesting(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.TESTING);
  }

  /**
   * Create a ChatManager instance for high-performance scenarios
   */
  static createForHighPerformance(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.HIGH_PERFORMANCE);
  }

  /**
   * Create a ChatManager instance for secure scenarios
   */
  static createForSecure(): UnifiedChatManager {
    return this.createForScenario(ConfigurationScenario.SECURE);
  }

  /**
   * Get configuration based on the scenario
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
   * Create chat with default options
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
 * Convenience creation function
 */
export const createChatManager = ChatManagerFactory.createForDevelopment;
export const createProductionChatManager = ChatManagerFactory.createForProduction;
export const createTestChatManager = ChatManagerFactory.createForTesting;