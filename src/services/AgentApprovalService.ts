/**
 * Service for handling agent-initiated tool call approvals
 */

const API_BASE_URL = "http://127.0.0.1:8080/v1";

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
  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `AgentApprovalService error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (response.status === 204) {
      return {} as T;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return (await response.json()) as T;
    }

    return {} as T;
  }

  /**
   * Check if there are any pending agent approvals for a session
   * Note: This is a placeholder. The actual endpoint needs to be implemented
   * in the backend to return pending approval requests.
   */
  async checkPendingApproval(
    _sessionId: string,
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
    reason?: string,
  ): Promise<AgentApprovalResponse> {
    try {
      return await this.request<AgentApprovalResponse>(
        `/chat/${sessionId}/approve-agent`,
        {
          method: "POST",
          body: JSON.stringify({
            request_id: requestId,
            approved,
            reason,
          }),
        },
      );
    } catch (error) {
      console.error("Failed to approve agent tool call:", error);
      throw error;
    }
  }
}

export const agentApprovalService = new AgentApprovalService();
