/**
 * useChatStateSync - Hook for polling backend chat state
 *
 * Implements backend-first architecture where backend is the source of truth.
 * Polls the backend at regular intervals to sync local state.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  backendContextService,
  type ActionResponse,
} from "../services/BackendContextService";

export interface ChatStateSyncOptions {
  /**
   * Chat ID to sync
   */
  chatId: string | null;

  /**
   * Base polling interval in milliseconds (default: 1000ms = 1s)
   */
  baseInterval?: number;

  /**
   * Maximum polling interval after backoff (default: 5000ms = 5s)
   */
  maxInterval?: number;

  /**
   * Whether polling is enabled (default: true)
   */
  enabled?: boolean;

  /**
   * Callback when state is received from backend
   */
  onStateUpdate?: (state: ActionResponse) => void;

  /**
   * Callback when polling encounters an error
   */
  onError?: (error: Error) => void;
}

/**
 * Hook to poll backend for chat state updates
 */
export function useChatStateSync(options: ChatStateSyncOptions) {
  const {
    chatId,
    baseInterval = 1000,
    maxInterval = 5000,
    enabled = true,
    onStateUpdate,
    onError,
  } = options;

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentIntervalRef = useRef<number>(baseInterval);
  const lastStateHashRef = useRef<string>("");
  const isPollingRef = useRef<boolean>(false);

  /**
   * Hash the state to detect changes
   */
  const hashState = useCallback((state: ActionResponse): string => {
    return JSON.stringify({
      messageCount: state.context.message_count,
      status: state.status,
      currentState: state.context.current_state,
    });
  }, []);

  /**
   * Poll for chat state
   */
  const pollState = useCallback(async () => {
    if (!chatId || !enabled || isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;

    try {
      const state = await backendContextService.getChatState(chatId);

      // Check if state has changed
      const stateHash = hashState(state);
      const hasChanged = stateHash !== lastStateHashRef.current;

      if (hasChanged) {
        lastStateHashRef.current = stateHash;

        // Reset interval to base on change
        currentIntervalRef.current = baseInterval;

        // Notify callback
        if (onStateUpdate) {
          onStateUpdate(state);
        }
      } else {
        // Exponential backoff when no changes
        currentIntervalRef.current = Math.min(
          currentIntervalRef.current * 1.5,
          maxInterval,
        );
      }
    } catch (error) {
      console.error("Error polling chat state:", error);

      if (onError) {
        onError(error as Error);
      }

      // On error, also back off
      currentIntervalRef.current = Math.min(
        currentIntervalRef.current * 2,
        maxInterval,
      );
    } finally {
      isPollingRef.current = false;
    }
  }, [
    chatId,
    enabled,
    baseInterval,
    maxInterval,
    hashState,
    onStateUpdate,
    onError,
  ]);

  /**
   * Start polling
   */
  const startPolling = useCallback(() => {
    if (intervalRef.current) {
      return; // Already polling
    }

    // Initial poll
    pollState();

    // Set up interval
    intervalRef.current = setInterval(() => {
      pollState();
    }, currentIntervalRef.current);
  }, [pollState]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Reset interval to base
    currentIntervalRef.current = baseInterval;
  }, [baseInterval]);

  /**
   * Reset polling state
   */
  const resetPolling = useCallback(() => {
    lastStateHashRef.current = "";
    currentIntervalRef.current = baseInterval;
  }, [baseInterval]);

  // Effect to manage polling lifecycle
  useEffect(() => {
    if (!chatId || !enabled) {
      stopPolling();
      return;
    }

    startPolling();

    return () => {
      stopPolling();
    };
  }, [chatId, enabled, startPolling, stopPolling]);

  // Effect to pause polling when window is inactive
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else if (chatId && enabled) {
        resetPolling();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [chatId, enabled, startPolling, stopPolling, resetPolling]);

  // Dynamically adjust interval
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        pollState();
      }, currentIntervalRef.current);
    }
  }, [currentIntervalRef.current, pollState]);

  return {
    isPolling: intervalRef.current !== null,
    currentInterval: currentIntervalRef.current,
    startPolling,
    stopPolling,
    resetPolling,
  };
}
