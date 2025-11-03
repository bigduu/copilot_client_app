/**
 * Service for handling agent-initiated tool call approvals
 */

import { HttpServices } from "./HttpServices";

export interface AgentApprovalRequest {
  request_id: string;
  session_id: string;
  tool_name: string;
  tool_description: string;
  parameters: Record<string, any>;
}

export interface AgentApprovalResponse {
  status: "completed" | "awaiting_approval" | "awaiting_tool_approval";
  message?: string;
}

export interface PendingApprovalResponse {
  has_pending: boolean;
  request?: AgentApprovalRequest;
}

export class AgentApprovalService {
  private httpService: HttpServices;

  constructor() {
    this.httpService = new HttpServices();
  }

  /**
   * Check if there are any pending agent approvals for a session
   * Note: This is a placeholder. The actual endpoint needs to be implemented
   * in the backend to return pending approval requests.
   */
  async checkPendingApproval(
    sessionId: string
  ): Promise<PendingApprovalResponse> {
    try {
      // TODO: Implement backend endpoint to check for pending approvals
      // For now, return no pending approvals
      return {
        has_pending: false,
      };
    } catch (error) {
      console.error("Failed to check pending approvals:", error);
      return {
        has_pending: false,
      };
    }
  }

  /**
   * Approve an agent-initiated tool call
   * @param sessionId Chat session ID
   * @param requestId Approval request ID
   * @param approved Whether to approve or reject
   * @param reason Optional rejection reason
   */
  async approveAgentToolCall(
    sessionId: string,
    requestId: string,
    approved: boolean,
    reason?: string
  ): Promise<AgentApprovalResponse> {
    try {
      const response = await this.httpService.post<AgentApprovalResponse>(
        `/v1/chat/${sessionId}/approve-agent`,
        {
          request_id: requestId,
          approved,
          reason,
        }
      );
      return response;
    } catch (error) {
      console.error("Failed to approve agent tool call:", error);
      throw error;
    }
  }
}

export const agentApprovalService = new AgentApprovalService();
