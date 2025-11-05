import { ApprovalManager as IApprovalManager } from "../interfaces/chat-manager";
import {
  OperationResult,
  ApprovalConfig,
  // ApprovalAction,
  ApprovalFlow,
} from "../types/unified-chat";

/**
 * Approval Event Type
 */
interface ApprovalEvent {
  type:
    | "approval_requested"
    | "approval_approved"
    | "approval_rejected"
    | "approval_timeout";
  operationId: string;
  messageId?: string;
  data?: any;
  timestamp: number;
}

/**
 * Pending Approval Operation
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
 * Approval Manager
 * Manages automatic and manual approval processes
 */
export class ApprovalManager implements IApprovalManager {
  private initialized = false;
  private pendingApprovals = new Map<string, PendingApproval>();
  private globalConfig: ApprovalConfig;
  private subscribers = new Set<(event: ApprovalEvent) => void>();
  private approvalHistory = new Map<string, ApprovalFlow>();

  constructor() {
    // Default configuration
    this.globalConfig = {
      autoApprove: false,
      approvalTimeout: 30000, // 30-second timeout
      approvalMessage: "Please confirm whether to perform this operation",
      requiredApprovers: [],
    };
  }

  /**
   * Request Approval
   */
  async requestApproval(
    messageId: string,
    config?: ApprovalConfig,
  ): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error("ApprovalManager is not initialized");
      }

      const operationId = this.generateOperationId();
      const effectiveConfig = { ...this.globalConfig, ...config };

      // Check for auto-approval
      if (effectiveConfig.autoApprove) {
        const approvalFlow: ApprovalFlow = {
          approved: true,
          automatic: true,
          timestamp: Date.now(),
          details: { reason: "Auto-approved" },
        };

        this.approvalHistory.set(operationId, approvalFlow);

        // Publish approval event
        this.publishEvent({
          type: "approval_approved",
          operationId,
          messageId,
          data: approvalFlow,
          timestamp: Date.now(),
        });

        return {
          success: true,
          message: "Operation has been auto-approved",
        };
      }

      // Create pending approval record
      const pendingApproval: PendingApproval = {
        operationId,
        messageId,
        requestedAt: new Date(),
        config: effectiveConfig,
        data: config,
      };

      // Set timeout handling
      if (
        effectiveConfig.approvalTimeout &&
        effectiveConfig.approvalTimeout > 0
      ) {
        pendingApproval.timeout = window.setTimeout(() => {
          this.handleTimeout(operationId);
        }, effectiveConfig.approvalTimeout);
      }

      this.pendingApprovals.set(operationId, pendingApproval);

      // Publish approval request event
      this.publishEvent({
        type: "approval_requested",
        operationId,
        messageId,
        data: {
          config: effectiveConfig,
          message: effectiveConfig.approvalMessage,
        },
        timestamp: Date.now(),
      });

      return {
        success: true,
        data: undefined,
        message: "Approval request submitted, awaiting approval",
      };
    } catch (error) {
      console.error("Failed to request approval:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to request approval",
      };
    }
  }

  /**
   * Configure Approval Settings
   */
  async configure(config: ApprovalConfig): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error("ApprovalManager is not initialized");
      }

      // Validate configuration
      this.validateConfig(config);

      // Update global configuration
      this.globalConfig = { ...this.globalConfig, ...config };

      return {
        success: true,
        message: "Approval configuration has been updated",
      };
    } catch (error) {
      console.error("Failed to configure approval settings:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to configure approval",
      };
    }
  }

  /**
   * Approve Operation
   */
  async approve(operationId: string): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error("ApprovalManager is not initialized");
      }

      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return {
          success: false,
          error: "Operation does not exist or has been processed",
          message: `Operation ${operationId} does not exist or has been processed`,
        };
      }

      // Clear timeout timer
      if (pendingApproval.timeout) {
        window.clearTimeout(pendingApproval.timeout);
      }

      // Remove pending approval record
      this.pendingApprovals.delete(operationId);

      // Record approval result
      const approvalFlow: ApprovalFlow = {
        approved: true,
        automatic: false,
        timestamp: Date.now(),
        details: {
          approvedAt: new Date().toISOString(),
          reason: "Manually approved",
        },
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // Publish approval event
      this.publishEvent({
        type: "approval_approved",
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: "Operation has been approved",
      };
    } catch (error) {
      console.error("Failed to approve operation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to approve operation",
      };
    }
  }

  /**
   * Reject Operation
   */
  async reject(
    operationId: string,
    reason?: string,
  ): Promise<OperationResult<void>> {
    try {
      if (!this.initialized) {
        throw new Error("ApprovalManager is not initialized");
      }

      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return {
          success: false,
          error: "Operation does not exist or has been processed",
          message: `Operation ${operationId} does not exist or has been processed`,
        };
      }

      // Clear timeout timer
      if (pendingApproval.timeout) {
        window.clearTimeout(pendingApproval.timeout);
      }

      // Remove pending approval record
      this.pendingApprovals.delete(operationId);

      // Record approval result
      const approvalFlow: ApprovalFlow = {
        approved: false,
        automatic: false,
        timestamp: Date.now(),
        details: {
          rejectedAt: new Date().toISOString(),
          reason: reason || "Manually rejected",
        },
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // Publish rejection event
      this.publishEvent({
        type: "approval_rejected",
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now(),
      });

      return {
        success: true,
        message: "Operation has been rejected",
      };
    } catch (error) {
      console.error("Failed to reject operation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: "Failed to reject operation",
      };
    }
  }

  /**
   * Subscribe to Approval Events
   */
  subscribe(callback: (event: any) => void): () => void {
    this.subscribers.add(callback);

    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Initialize
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Clear all pending approvals
      this.clearAllPendingApprovals();

      // Clear history
      this.approvalHistory.clear();

      this.initialized = true;
      console.log("ApprovalManager initialized successfully");
    } catch (error) {
      throw new Error(
        `ApprovalManager initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Dispose
   */
  async dispose(): Promise<void> {
    try {
      // Clear all pending approvals
      this.clearAllPendingApprovals();

      // Clear subscribers
      this.subscribers.clear();

      // Clear history
      this.approvalHistory.clear();

      this.initialized = false;
      console.log("ApprovalManager has been disposed");
    } catch (error) {
      console.error("ApprovalManager disposal failed:", error);
    }
  }

  /**
   * Get List of Pending Approvals
   */
  getPendingApprovals(): Array<{
    operationId: string;
    messageId: string;
    requestedAt: Date;
    config: ApprovalConfig;
  }> {
    return Array.from(this.pendingApprovals.values()).map((approval) => ({
      operationId: approval.operationId,
      messageId: approval.messageId,
      requestedAt: approval.requestedAt,
      config: approval.config,
    }));
  }

  /**
   * Get Approval History
   */
  getApprovalHistory(): Array<{ operationId: string; flow: ApprovalFlow }> {
    return Array.from(this.approvalHistory.entries()).map(
      ([operationId, flow]) => ({
        operationId,
        flow,
      }),
    );
  }

  /**
   * Get Global Configuration
   */
  getGlobalConfig(): ApprovalConfig {
    return { ...this.globalConfig };
  }

  /**
   * Handle Timeout
   */
  private handleTimeout(operationId: string): void {
    try {
      const pendingApproval = this.pendingApprovals.get(operationId);
      if (!pendingApproval) {
        return;
      }

      // Remove pending approval record
      this.pendingApprovals.delete(operationId);

      // Record timeout result
      const approvalFlow: ApprovalFlow = {
        approved: false,
        automatic: true,
        timestamp: Date.now(),
        details: {
          reason: "Approval timed out",
          timeoutAt: new Date().toISOString(),
        },
      };

      this.approvalHistory.set(operationId, approvalFlow);

      // Publish timeout event
      this.publishEvent({
        type: "approval_timeout",
        operationId,
        messageId: pendingApproval.messageId,
        data: approvalFlow,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to handle approval timeout:", error);
    }
  }

  /**
   * Publish Event
   */
  private publishEvent(event: ApprovalEvent): void {
    try {
      for (const subscriber of this.subscribers) {
        try {
          subscriber(event);
        } catch (error) {
          console.error("Subscriber execution failed:", error);
        }
      }
    } catch (error) {
      console.error("Failed to publish approval event:", error);
    }
  }

  /**
   * Validate Configuration
   */
  private validateConfig(config: ApprovalConfig): void {
    if (config.approvalTimeout !== undefined) {
      if (
        typeof config.approvalTimeout !== "number" ||
        config.approvalTimeout < 0
      ) {
        throw new Error("Approval timeout must be a non-negative number");
      }
    }

    if (config.requiredApprovers !== undefined) {
      if (!Array.isArray(config.requiredApprovers)) {
        throw new Error("Required approvers must be an array");
      }
    }

    if (config.approvalMessage !== undefined) {
      if (
        typeof config.approvalMessage !== "string" ||
        config.approvalMessage.trim() === ""
      ) {
        throw new Error("Approval message cannot be empty");
      }
    }
  }

  /**
   * Clear All Pending Approvals
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
      console.error("Failed to clear pending approvals:", error);
    }
  }

  /**
   * Generate Operation ID
   */
  private generateOperationId(): string {
    return `approval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
