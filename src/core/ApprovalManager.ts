import {
  ApprovalManager as IApprovalManager,
} from '../interfaces/chat-manager';
import {
  OperationResult,
  ApprovalConfig,
  // ApprovalAction,
  ApprovalFlow
} from '../types/unified-chat';

/**
 * 审批事件类型
 */
interface ApprovalEvent {
  type: 'approval_requested' | 'approval_approved' | 'approval_rejected' | 'approval_timeout';
  operationId: string;
  messageId?: string;
  data?: any;
  timestamp: number;
}

/**
 * 待审批操作
 */
interface PendingApproval {
  operationId: string;
  messageId: string;
  requestedAt: Date;
  config: ApprovalConfig;
  timeout?: number;
  data?: any;
}

/**
 * 审批管理器
 * 管理自动和手动审批流程
 */
export class ApprovalManager implements IApprovalManager {
  private initialized = false;
  private pendingApprovals = new Map<string, PendingApproval>();
  private globalConfig: ApprovalConfig;
  private subscribers = new Set<(event: ApprovalEvent) => void>();
  private approvalHistory = new Map<string, ApprovalFlow>();

  constructor() {
    // 默认配置
    this.globalConfig = {
      autoApprove: false,
      approvalTimeout: 30000, // 30秒超时
      approvalMessage: '请确认是否执行此操作',
      requiredApprovers: []
    };
  }

  /**
   * 请求审批
   */
  async requestApproval(messageId: string, config?: ApprovalConfig): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error('ApprovalManager 未初始化');
      }

      const operationId = this.generateOperationId();
      const effectiveConfig = { ...this.globalConfig, ...config };

      // 检查是否自动审批
      if (effectiveConfig.autoApprove) {
        const approvalFlow: ApprovalFlow = {
          approved: true,
          automatic: true,
          timestamp: Date.now(),
          details: { reason: '自动审批' }
        };

        this.approvalHistory.set(operationId, approvalFlow);
        
        // 发布审批事件
        this.publishEvent({
          type: 'approval_approved',
          operationId,
          messageId,
          data: approvalFlow,
          timestamp: Date.now()
        });

        return {
          success: true,
          message: '操作已自动审批'
        };
      }

      // 创建待审批记录
      const pendingApproval: PendingApproval = {
        operationId,
        messageId,
        requestedAt: new Date(),
        config: effectiveConfig,
        data: config
      };

      // 设置超时处理
      if (effectiveConfig.approvalTimeout && effectiveConfig.approvalTimeout > 0) {
        pendingApproval.timeout = window.setTimeout(() => {
          this.handleTimeout(operationId);
        }, effectiveConfig.approvalTimeout);
      }

      this.pendingApprovals.set(operationId, pendingApproval);

      // 发布审批请求事件
      this.publishEvent({
        type: 'approval_requested',
        operationId,
        messageId,
        data: {
          config: effectiveConfig,
          message: effectiveConfig.approvalMessage
        },
        timestamp: Date.now()
      });

      return {
        success: true,
        data: undefined,
        message: '审批请求已提交，等待审批'
      };
    } catch (error) {
      console.error('请求审批失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '审批请求失败'
      };
    }
  }

  /**
   * 配置审批设置
   */
  async configure(config: ApprovalConfig): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error('ApprovalManager 未初始化');
      }

      // 验证配置
      this.validateConfig(config);

      // 更新全局配置
      this.globalConfig = { ...this.globalConfig, ...config };

      return {
        success: true,
        message: '审批配置已更新'
      };
    } catch (error) {
      console.error('配置审批设置失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '审批配置失败'
      };
    }
  }

  /**
   * 批准操作
   */
  async approve(operationId: string): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error('ApprovalManager 未初始化');
      }

      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return {
          success: false,
          error: '操作不存在或已处理',
          message: `操作 ${operationId} 不存在或已处理`
        };
      }

      // 清理超时定时器
      if (pendingApproval.timeout) {
        window.clearTimeout(pendingApproval.timeout);
      }

      // 移除待审批记录
      this.pendingApprovals.delete(operationId);

      // 记录审批结果
      const approvalFlow: ApprovalFlow = {
        approved: true,
        automatic: false,
        timestamp: Date.now(),
        details: {
          approvedAt: new Date().toISOString(),
          reason: '手动审批通过'
        }
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // 发布审批通过事件
      this.publishEvent({
        type: 'approval_approved',
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: '操作已批准'
      };
    } catch (error) {
      console.error('批准操作失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '批准操作失败'
      };
    }
  }

  /**
   * 拒绝操作
   */
  async reject(operationId: string, reason?: string): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error('ApprovalManager 未初始化');
      }

      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return {
          success: false,
          error: '操作不存在或已处理',
          message: `操作 ${operationId} 不存在或已处理`
        };
      }

      // 清理超时定时器
      if (pendingApproval.timeout) {
        window.clearTimeout(pendingApproval.timeout);
      }

      // 移除待审批记录
      this.pendingApprovals.delete(operationId);

      // 记录审批结果
      const approvalFlow: ApprovalFlow = {
        approved: false,
        automatic: false,
        timestamp: Date.now(),
        details: {
          rejectedAt: new Date().toISOString(),
          reason: reason || '手动拒绝'
        }
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // 发布审批拒绝事件
      this.publishEvent({
        type: 'approval_rejected',
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now()
      });

      return {
        success: true,
        message: '操作已拒绝'
      };
    } catch (error) {
      console.error('拒绝操作失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '拒绝操作失败'
      };
    }
  }

  /**
   * 订阅审批事件
   */
  subscribe(callback: (event: any) => void): () => void {
    this.subscribers.add(callback);
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 清理所有待审批操作
      this.clearAllPendingApprovals();
      
      // 清理历史记录
      this.approvalHistory.clear();

      this.initialized = true;
      console.log('ApprovalManager 初始化完成');
    } catch (error) {
      throw new Error(`ApprovalManager 初始化失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 销毁
   */
  async dispose(): Promise<void> {
    try {
      // 清理所有待审批操作
      this.clearAllPendingApprovals();
      
      // 清理订阅者
      this.subscribers.clear();
      
      // 清理历史记录
      this.approvalHistory.clear();
      
      this.initialized = false;
      console.log('ApprovalManager 已销毁');
    } catch (error) {
      console.error('ApprovalManager 销毁失败:', error);
    }
  }

  /**
   * 获取待审批操作列表
   */
  getPendingApprovals(): Array<{ operationId: string; messageId: string; requestedAt: Date; config: ApprovalConfig }> {
    return Array.from(this.pendingApprovals.values()).map(approval => ({
      operationId: approval.operationId,
      messageId: approval.messageId,
      requestedAt: approval.requestedAt,
      config: approval.config
    }));
  }

  /**
   * 获取审批历史
   */
  getApprovalHistory(): Array<{ operationId: string; flow: ApprovalFlow }> {
    return Array.from(this.approvalHistory.entries()).map(([operationId, flow]) => ({
      operationId,
      flow
    }));
  }

  /**
   * 获取全局配置
   */
  getGlobalConfig(): ApprovalConfig {
    return { ...this.globalConfig };
  }

  /**
   * 处理超时
   */
  private handleTimeout(operationId: string): void {
    try {
      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return;
      }

      // 移除待审批记录
      this.pendingApprovals.delete(operationId);

      // 记录超时结果
      const approvalFlow: ApprovalFlow = {
        approved: false,
        automatic: true,
        timestamp: Date.now(),
        details: {
          reason: '审批超时',
          timeoutAt: new Date().toISOString()
        }
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // 发布超时事件
      this.publishEvent({
        type: 'approval_timeout',
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('处理审批超时失败:', error);
    }
  }

  /**
   * 发布事件
   */
  private publishEvent(event: ApprovalEvent): void {
    try {
      for (const subscriber of this.subscribers) {
        try {
          subscriber(event);
        } catch (error) {
          console.error('订阅者执行失败:', error);
        }
      }
    } catch (error) {
      console.error('发布审批事件失败:', error);
    }
  }

  /**
   * 验证配置
   */
  private validateConfig(config: ApprovalConfig): void {
    if (config.approvalTimeout !== undefined) {
      if (typeof config.approvalTimeout !== 'number' || config.approvalTimeout < 0) {
        throw new Error('审批超时时间必须是非负数');
      }
    }

    if (config.requiredApprovers !== undefined) {
      if (!Array.isArray(config.requiredApprovers)) {
        throw new Error('必需审批者必须是数组');
      }
    }

    if (config.approvalMessage !== undefined) {
      if (typeof config.approvalMessage !== 'string' || config.approvalMessage.trim() === '') {
        throw new Error('审批消息不能为空');
      }
    }
  }

  /**
   * 清理所有待审批操作
   */
  private clearAllPendingApprovals(): void {
    try {
      for (const approval of this.pendingApprovals.values()) {
        if (approval.timeout) {
          clearTimeout(approval.timeout);
        }
      }
      this.pendingApprovals.clear();
    } catch (error) {
      console.error('清理待审批操作失败:', error);
    }
  }

  /**
   * 生成操作ID
   */
  private generateOperationId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}