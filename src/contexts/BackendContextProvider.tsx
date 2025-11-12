import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import {
  BackendContextService,
  ChatContextDTO,
  MessageDTO,
  CreateContextRequest,
} from "../services/BackendContextService";

// Define the context type
interface BackendContextType {
  currentContext: ChatContextDTO | null;
  messages: MessageDTO[];
  isLoading: boolean;
  error: string | null;
  loadContext: (contextId: string, branch?: string) => Promise<void>;
  createContext: (req: CreateContextRequest) => Promise<ChatContextDTO | null>;
  addMessage: (
    contextId: string,
    content: string,
    branch?: string
  ) => Promise<void>;
  approveTools: (contextId: string, toolCallIds: string[]) => Promise<void>;
  switchBranch: (contextId: string, branchName: string) => Promise<void>;
  deleteContext: (contextId: string) => Promise<void>;
  listContexts: () => Promise<ChatContextDTO[]>;
  createSystemPrompt: (
    name: string,
    content: string,
    description?: string
  ) => Promise<void>;
  getSystemPrompt: (id: string) => Promise<any>;
  updateSystemPrompt: (
    id: string,
    name: string,
    content: string,
    description?: string
  ) => Promise<void>;
  deleteSystemPrompt: (id: string) => Promise<void>;
  listSystemPrompts: () => Promise<any[]>;
  updateAgentRole: (
    contextId: string,
    role: "planner" | "actor"
  ) => Promise<void>;
  updateMermaidDiagrams: (contextId: string, enabled: boolean) => Promise<void>;
  enablePolling: () => void;
  disablePolling: () => void;
}

// Create the context
const BackendContext = createContext<BackendContextType | undefined>(undefined);

// Provider component
export const BackendContextProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [currentContext, setCurrentContext] = useState<ChatContextDTO | null>(
    null
  );
  const [messages, setMessages] = useState<MessageDTO[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);

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
        const context = await service.getContext(id);
        setCurrentContext(context);
        setMessages([]);
        return context;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create context"
        );
        console.error("Failed to create context:", err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  // Add message
  const addMessage = useCallback(
    async (contextId: string, content: string, branch?: string) => {
      try {
        await service.addMessage(contextId, { role: "user", content, branch });
        await loadContext(contextId, branch);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add message");
        console.error("Failed to add message:", err);
      }
    },
    [service, loadContext]
  );

  // Approve tools
  const approveTools = useCallback(
    async (contextId: string, toolCallIds: string[]) => {
      try {
        await service.approveTools(contextId, { tool_call_ids: toolCallIds });
        await loadContext(contextId);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to approve tools"
        );
        console.error("Failed to approve tools:", err);
      }
    },
    [service, loadContext]
  );

  // Switch branch
  const switchBranch = useCallback(
    async (contextId: string, branchName: string) => {
      try {
        // Just reload context with the new branch - backend doesn't have a switchBranch API
        await loadContext(contextId, branchName);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to switch branch"
        );
        console.error("Failed to switch branch:", err);
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

  // List all contexts - returns ContextSummaryDTO[] which is compatible with ChatContextDTO[]
  const listContexts = useCallback(async () => {
    try {
      const summaries = await service.listContexts();
      // Convert ContextSummaryDTO to ChatContextDTO by adding missing fields
      return summaries.map((summary) => ({
        ...summary,
        config: {
          ...summary.config,
          parameters: {},
          agent_role: "actor" as const,
          mermaid_diagrams: true, // Default value for summary view
        },
        branches: [], // Empty branches array for summary view
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to list contexts");
      console.error("Failed to list contexts:", err);
      return [];
    }
  }, [service]);

  // System prompt operations
  const createSystemPrompt = useCallback(
    async (name: string, content: string, _description?: string) => {
      try {
        // Backend API only takes id and content, ignore description for now
        await service.createSystemPrompt(name, content);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to create system prompt"
        );
        console.error("Failed to create system prompt:", err);
      }
    },
    [service]
  );

  const getSystemPrompt = useCallback(
    async (id: string) => {
      try {
        return await service.getSystemPrompt(id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get system prompt"
        );
        console.error("Failed to get system prompt:", err);
        return null;
      }
    },
    [service]
  );

  const updateSystemPrompt = useCallback(
    async (
      id: string,
      _name: string,
      content: string,
      _description?: string
    ) => {
      try {
        // Backend API only takes id and content, ignore name and description
        await service.updateSystemPrompt(id, content);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update system prompt"
        );
        console.error("Failed to update system prompt:", err);
      }
    },
    [service]
  );

  const deleteSystemPrompt = useCallback(
    async (id: string) => {
      try {
        await service.deleteSystemPrompt(id);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete system prompt"
        );
        console.error("Failed to delete system prompt:", err);
      }
    },
    [service]
  );

  const listSystemPrompts = useCallback(async () => {
    try {
      return await service.listSystemPrompts();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to list system prompts"
      );
      console.error("Failed to list system prompts:", err);
      return [];
    }
  }, [service]);

  // Update agent role
  const updateAgentRole = useCallback(
    async (contextId: string, role: "planner" | "actor") => {
      setIsLoading(true);
      setError(null);
      const wasPollingEnabled = pollingEnabled;

      // Disable polling IMMEDIATELY to prevent race conditions
      setPollingEnabled(false);

      try {
        console.log(
          `[BackendContextProvider] ========== UPDATE AGENT ROLE ==========`
        );
        console.log(`[BackendContextProvider] Requested role: ${role}`);
        console.log(
          `[BackendContextProvider] Current role: ${currentContext?.config.agent_role}`
        );
        console.log(`[BackendContextProvider] Context ID: ${contextId}`);

        // Update backend first
        const response = await service.updateAgentRole(contextId, role);
        console.log(`[BackendContextProvider] Backend response:`, response);

        // Then fetch the updated context from backend to ensure consistency
        const updatedContext = await service.getContext(contextId);
        console.log(
          `[BackendContextProvider] Fetched updated context:`,
          updatedContext
        );
        console.log(
          `[BackendContextProvider] Updated context role: ${updatedContext.config.agent_role}`
        );

        setCurrentContext(updatedContext);

        console.log(
          `[BackendContextProvider] State updated successfully to: ${updatedContext.config.agent_role}`
        );
        console.log(
          `[BackendContextProvider] ==========================================`
        );

        // Wait before re-enabling polling
        setTimeout(() => {
          if (wasPollingEnabled) {
            console.log(
              "[BackendContextProvider] Re-enabling polling after role update"
            );
            setPollingEnabled(true);
          }
        }, 3000);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update agent role"
        );
        console.error("Failed to update agent role:", err);
        if (wasPollingEnabled) {
          setPollingEnabled(true);
        }
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service, pollingEnabled, currentContext]
  );

  // Update Mermaid diagrams setting
  const updateMermaidDiagrams = useCallback(
    async (contextId: string, enabled: boolean) => {
      setIsLoading(true);
      setError(null);

      try {
        console.log(
          `[BackendContextProvider] Updating Mermaid diagrams to: ${enabled}`
        );

        // Update backend configuration
        await service.updateContextConfig(contextId, {
          mermaid_diagrams: enabled,
        });

        // Fetch updated context to ensure consistency
        const updatedContext = await service.getContext(contextId);
        setCurrentContext(updatedContext);

        console.log(
          `[BackendContextProvider] Mermaid diagrams updated successfully`
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update Mermaid diagrams setting"
        );
        console.error("Failed to update Mermaid diagrams:", err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [service]
  );

  // Enable/disable polling
  const enablePolling = useCallback(() => {
    console.log("[BackendContextProvider] Polling enabled");
    setPollingEnabled(true);
  }, []);

  const disablePolling = useCallback(() => {
    console.log("[BackendContextProvider] Polling disabled");
    setPollingEnabled(false);
  }, []);

  // Polling effect
  useEffect(() => {
    if (!currentContext?.id || !pollingEnabled) {
      return;
    }

    const pollInterval = 2000;
    const poll = async () => {
      try {
        const context = await service.getContext(currentContext.id);
        const hasStateChanged =
          context.current_state !== currentContext.current_state;
        const hasMessageCountChanged =
          context.message_count !== currentContext.message_count;
        const hasRoleChanged =
          context.config.agent_role !== currentContext.config.agent_role;

        if (hasStateChanged || hasMessageCountChanged || hasRoleChanged) {
          console.log("[BackendContextProvider] Polling detected changes:", {
            hasStateChanged,
            hasMessageCountChanged,
            hasRoleChanged,
            oldRole: currentContext.config.agent_role,
            newRole: context.config.agent_role,
          });
          setCurrentContext(context);

          if (hasMessageCountChanged) {
            const messagesData = await service.getMessages(currentContext.id, {
              branch: context.active_branch_name,
            });
            setMessages(messagesData.messages);
          }
        }
      } catch (err) {
        console.error("Polling error:", err);
        setPollingEnabled(false);
      }
    };

    pollingIntervalRef.current = setInterval(poll, pollInterval);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [currentContext?.id, pollingEnabled, service, currentContext]);

  const value: BackendContextType = {
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
    updateMermaidDiagrams,
    enablePolling,
    disablePolling,
  };

  return (
    <BackendContext.Provider value={value}>{children}</BackendContext.Provider>
  );
};

// Custom hook to use the context
export const useBackendContext = () => {
  const context = useContext(BackendContext);
  if (context === undefined) {
    throw new Error(
      "useBackendContext must be used within a BackendContextProvider"
    );
  }
  return context;
};
