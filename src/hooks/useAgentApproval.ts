import { useState, useCallback } from "react";
import {
  agentApprovalService,
  AgentApprovalRequest,
  AgentApprovalResponse,
} from "../services/AgentApprovalService";

export interface AgentApprovalState {
  pendingRequest: AgentApprovalRequest | null;
  isApproving: boolean;
  error: string | null;
}

export function useAgentApproval() {
  const [state, setState] = useState<AgentApprovalState>({
    pendingRequest: null,
    isApproving: false,
    error: null,
  });

  /**
   * Set a pending approval request
   */
  const setPendingRequest = useCallback(
    (request: AgentApprovalRequest | null) => {
      setState((prev) => ({
        ...prev,
        pendingRequest: request,
        error: null,
      }));
    },
    []
  );

  /**
   * Approve the pending tool call
   */
  const approve = useCallback(
    async (requestId: string): Promise<AgentApprovalResponse | null> => {
      if (!state.pendingRequest) {
        console.error("No pending request to approve");
        return null;
      }

      setState((prev) => ({ ...prev, isApproving: true, error: null }));

      try {
        const response = await agentApprovalService.approveAgentToolCall(
          state.pendingRequest.session_id,
          requestId,
          true
        );

        // Clear pending request after successful approval
        setState({
          pendingRequest: null,
          isApproving: false,
          error: null,
        });

        return response;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to approve agent tool call";
        setState((prev) => ({
          ...prev,
          isApproving: false,
          error: errorMessage,
        }));
        return null;
      }
    },
    [state.pendingRequest]
  );

  /**
   * Reject the pending tool call
   */
  const reject = useCallback(
    async (
      requestId: string,
      reason?: string
    ): Promise<AgentApprovalResponse | null> => {
      if (!state.pendingRequest) {
        console.error("No pending request to reject");
        return null;
      }

      setState((prev) => ({ ...prev, isApproving: true, error: null }));

      try {
        const response = await agentApprovalService.approveAgentToolCall(
          state.pendingRequest.session_id,
          requestId,
          false,
          reason
        );

        // Clear pending request after successful rejection
        setState({
          pendingRequest: null,
          isApproving: false,
          error: null,
        });

        return response;
      } catch (error) {
        const errorMessage =
          error instanceof Error
            ? error.message
            : "Failed to reject agent tool call";
        setState((prev) => ({
          ...prev,
          isApproving: false,
          error: errorMessage,
        }));
        return null;
      }
    },
    [state.pendingRequest]
  );

  /**
   * Clear any error
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return {
    pendingRequest: state.pendingRequest,
    isApproving: state.isApproving,
    error: state.error,
    setPendingRequest,
    approve,
    reject,
    clearError,
  };
}

