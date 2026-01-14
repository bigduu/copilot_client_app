export interface UseChatState {
  chats: any[];
  currentChatId: string | null;
  currentChat: any | null;
  isProcessing: boolean;
  baseMessages: any[];
  pinnedChats: any[];
  unpinnedChats: any[];
  chatCount: number;
  addMessage: (chatId: string, message: any) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => void;
  selectChat: (chatId: string | null) => void;
  deleteChat: (chatId: string) => Promise<void>;
  deleteChats: (chatIds: string[]) => Promise<void>;
  pinChat: (chatId: string) => void;
  unpinChat: (chatId: string) => void;
  updateChat: (chatId: string, updates: any) => void;
  loadChats: () => Promise<void>;
  setProcessing: (isProcessing: boolean) => void;
}

export interface UseChatTitleGeneration {
  titleGenerationState: Record<
    string,
    { status: "idle" | "loading" | "error"; error?: string }
  >;
  autoGenerateTitles: boolean;
  isUpdatingAutoTitlePreference: boolean;
  generateChatTitle: (
    chatId: string,
    options?: { force?: boolean }
  ) => Promise<void>;
  setAutoGenerateTitlesPreference: (enabled: boolean) => Promise<void>;
  isDefaultTitle: (title: string | undefined | null) => boolean;
}

export interface UseChatOperations {
  createNewChat: (
    title?: string,
    options?: Partial<Omit<any, "id">>
  ) => Promise<void>;
  createChatWithSystemPrompt: (prompt: any) => Promise<void>;
  toggleChatPin: (chatId: string) => void;
  updateChatTitle: (chatId: string, newTitle: string) => void;
  deleteEmptyChats: () => void;
  deleteAllUnpinnedChats: () => void;
}

export interface UseChatStateMachine {
  interactionState: any;
  currentMessages: any[];
  pendingAgentApproval: any | null;
  send: (event: any) => void;
  setPendingAgentApproval: (approval: any | null) => void;
  retryLastMessage: () => Promise<void>;
}
