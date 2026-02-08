import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { ChatItem } from "../../types/chat";
import { createChatSlice, type ChatSlice } from "./chatSessionSlice";

const { deleteSessionMock } = vi.hoisted(() => ({
  deleteSessionMock: vi.fn(),
}));

vi.mock("../../services/AgentService", () => ({
  AgentClient: {
    getInstance: vi.fn(() => ({
      deleteSession: deleteSessionMock,
    })),
  },
}));

const createChat = (id: string, agentSessionId?: string): ChatItem => ({
  id,
  title: `Chat ${id}`,
  createdAt: Date.now(),
  pinned: false,
  messages: [],
  config: {
    systemPromptId: "general_assistant",
    baseSystemPrompt: "Base prompt",
    lastUsedEnhancedPrompt: null,
    agentSessionId,
  },
  currentInteraction: null,
});

const createTestStore = (): StoreApi<ChatSlice> => {
  const sliceCreator = createChatSlice as unknown as (
    set: StoreApi<ChatSlice>["setState"],
    get: StoreApi<ChatSlice>["getState"],
    api: StoreApi<ChatSlice>,
  ) => ChatSlice;

  return createStore<ChatSlice>()((set, get, api) => sliceCreator(set, get, api));
};

describe("chatSessionSlice deletion", () => {
  beforeEach(() => {
    localStorage.clear();
    deleteSessionMock.mockReset();
    deleteSessionMock.mockResolvedValue(undefined);
  });

  it("deletes the linked backend session before removing a chat", async () => {
    const store = createTestStore();
    const chat = createChat("chat-1", "session-1");

    store.setState((state) => ({
      ...state,
      chats: [chat],
      currentChatId: chat.id,
      latestActiveChatId: chat.id,
    }));

    await store.getState().deleteChat(chat.id);

    expect(deleteSessionMock).toHaveBeenCalledWith("session-1");
    expect(store.getState().chats).toHaveLength(0);
    expect(localStorage.getItem("copilot_chats_v3")).toBe("[]");
  });

  it("still removes chat locally when backend deletion fails", async () => {
    const store = createTestStore();
    const chat = createChat("chat-1", "session-1");
    deleteSessionMock.mockRejectedValueOnce(new Error("delete failed"));

    store.setState((state) => ({
      ...state,
      chats: [chat],
      currentChatId: chat.id,
      latestActiveChatId: chat.id,
    }));

    await expect(store.getState().deleteChat(chat.id)).resolves.toBeUndefined();

    expect(deleteSessionMock).toHaveBeenCalledWith("session-1");
    expect(store.getState().chats).toHaveLength(0);
  });

  it("deletes all linked backend sessions when removing multiple chats", async () => {
    const store = createTestStore();
    const chats = [
      createChat("chat-1", "session-1"),
      createChat("chat-2"),
      createChat("chat-3", "session-3"),
    ];

    store.setState((state) => ({
      ...state,
      chats,
      currentChatId: chats[0].id,
      latestActiveChatId: chats[0].id,
    }));

    await store.getState().deleteChats(chats.map((chat) => chat.id));

    expect(deleteSessionMock).toHaveBeenCalledTimes(2);
    expect(deleteSessionMock).toHaveBeenNthCalledWith(1, "session-1");
    expect(deleteSessionMock).toHaveBeenNthCalledWith(2, "session-3");
    expect(store.getState().chats).toHaveLength(0);
  });
});
