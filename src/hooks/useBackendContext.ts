import { useState, useCallback, useEffect, useRef } from "react";
import {
  BackendContextService,
  ChatContextDTO,
  MessageDTO,
  CreateContextRequest,
} from "../services/BackendContextService";

export const useBackendContext = () => {
  const [currentContext, setCurrentContext] = useState<ChatContextDTO | null>(
    null
  );
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false); // Disabled by default to prevent spam

  const service = new BackendContextService();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load context and messages
  const loadContext = useCallback(
    async (contextId: string, branch?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const context = await service.getContext(contextId);
        setCurrentContext(context);

        // Load messages for the specified or active branch
        const branchName = branch || context.active_branch_name;
        const messagesData = await service.getMessages(contextId, {
          branch: branchName,
        });
        setMessages(messagesData.messages);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load context");
        console.error("Failed to load context:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  // Create new context
  const createContext = useCallback(
    async (req: CreateContextRequest) => {
      setIsLoading(true);
      setError(null);
      try {
        const { id } = await service.createContext(req);
        await loadContext(id);
        return id;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create context"
        );
        console.error("Failed to create context:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, loadContext]
  );

  // Add message
  const addMessage = useCallback(
    async (
      contextId: string,
      role: string,
      content: string,
      branch?: string
    ) => {
      try {
        await service.addMessage(contextId, { role, content, branch });

        // Optimistically update local state
        const newMessage: MessageDTO = {
          id: `temp-${Date.now()}`,
          role,
          content: [{ type: "text", text: content }],
        };
        setMessages((prev) => [...prev, newMessage]);

        // Reload context to get actual message with ID
        await loadContext(contextId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add message");
        console.error("Failed to add message:", err);
        // Rollback optimistic update
        setMessages((prev) => prev.slice(0, -1));
      }
    },
    [service, loadContext]
  );

  // Approve tool calls
  const approveTools = useCallback(
    async (contextId: string, tool_call_ids: string[]) => {
      setIsLoading(true);
      setError(null);
      try {
        await service.approveTools(contextId, { tool_call_ids });
        // Refresh messages after approval to reflect state/tool results
        await loadContext(contextId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to approve tools"
        );
        console.error("Failed to approve tools:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, loadContext]
  );

  // Switch branch
  const switchBranch = useCallback(
    async (contextId: string, branchName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await loadContext(contextId, branchName);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to switch branch"
        );
        console.error("Failed to switch branch:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [loadContext]
  );

  // Delete context
  const deleteContext = useCallback(
    async (contextId: string) => {
      try {
        await service.deleteContext(contextId);
        if (currentContext?.id === contextId) {
          setCurrentContext(null);
          setMessages([]);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete context"
        );
        console.error("Failed to delete context:", err);
      }
    },
    [service, currentContext]
  );

  // List all contexts
  const listContexts = useCallback(async () => {
    try {
      return await service.listContexts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list contexts");
      console.error("Failed to list contexts:", err);
      return [];
    }
  }, [service]);

  // System prompt operations
  const createSystemPrompt = useCallback(
    async (id: string, content: string) => {
      return service.createSystemPrompt(id, content);
    },
    [service]
  );

  const getSystemPrompt = useCallback(
    async (id: string) => {
      return service.getSystemPrompt(id);
    },
    [service]
  );

  const updateSystemPrompt = useCallback(
    async (id: string, content: string) => {
      return service.updateSystemPrompt(id, content);
    },
    [service]
  );

  const deleteSystemPrompt = useCallback(
    async (id: string) => {
      return service.deleteSystemPrompt(id);
    },
    [service]
  );

  const listSystemPrompts = useCallback(async () => {
    return service.listSystemPrompts();
  }, [service]);

  // Update agent role
  const updateAgentRole = useCallback(
    async (contextId: string, role: "planner" | "actor") => {
      setIsLoading(true);
      setError(null);
      try {
        await service.updateAgentRole(contextId, role);
        // Reload context to get updated role
        await loadContext(contextId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update agent role"
        );
        console.error("Failed to update agent role:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, loadContext]
  );

  // Enable/disable polling
  const enablePolling = useCallback(() => setPollingEnabled(true), []);
  const disablePolling = useCallback(() => setPollingEnabled(false), []);

  // Polling effect - polls backend for state updates
  useEffect(() => {
    // Only poll if we have a valid context ID and polling is enabled
    if (!currentContext?.id || !pollingEnabled) {
      // Clear any existing interval when conditions aren't met
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollInterval = 5000; // Poll every 5 seconds (reduced frequency)

    const poll = async () => {
      try {
        const context = await service.getContext(currentContext.id);
        
        // Only update if state changed to avoid unnecessary re-renders
        if (context.current_state !== currentContext.current_state || 
            context.message_count !== currentContext.message_count) {
          setCurrentContext(context);
          
          // Reload messages if count changed
          if (context.message_count !== currentContext.message_count) {
            const messagesData = await service.getMessages(currentContext.id, {
              branch: context.active_branch_name,
            });
            setMessages(messagesData.messages);
          }
        }
      } catch (err) {
        // Silently fail for polling errors to avoid UI noise
        console.error("Polling error:", err);
        // Disable polling on persistent errors to prevent spam
        setPollingEnabled(false);
      }
    };

    // Start polling
    pollingIntervalRef.current = setInterval(poll, pollInterval);

    // Cleanup on unmount or when context changes
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [currentContext?.id, pollingEnabled, service]);

  return {
    currentContext,
    messages,
    isLoading,
    error,
    loadContext,
    createContext,
    addMessage,
    approveTools,
    switchBranch,
    deleteContext,
    listContexts,
    createSystemPrompt,
    getSystemPrompt,
    updateSystemPrompt,
    deleteSystemPrompt,
    listSystemPrompts,
    updateAgentRole,
    enablePolling,
    disablePolling,
  };
};
