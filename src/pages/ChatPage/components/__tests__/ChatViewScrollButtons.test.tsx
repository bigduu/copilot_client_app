import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStoreState = {
  currentChatId: "chat-1",
  chats: [
    {
      id: "chat-1",
      messages: [],
      config: {},
    },
  ],
  deleteMessage: vi.fn(),
  updateChat: vi.fn(),
  isProcessing: false,
};

vi.mock("antd", async () => {
  const actual = await vi.importActual<any>("antd");
  return {
    ...actual,
    Grid: {
      ...actual.Grid,
      useBreakpoint: () => ({ xs: false }),
    },
  };
});

vi.mock("../../store", () => ({
  useAppStore: (selector: (state: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

vi.mock("../ChatView/useChatViewMessages", () => ({
  useChatViewMessages: () => ({
    systemPromptMessage: null,
    renderableMessages: [],
    convertRenderableEntry: vi.fn(),
  }),
}));

vi.mock("../ChatView/useChatViewScroll", () => ({
  useChatViewScroll: () => ({
    handleMessagesScroll: vi.fn(),
    resetUserScroll: vi.fn(),
    scrollToBottom: vi.fn(),
    scrollToTop: vi.fn(),
    showScrollToBottom: false,
    showScrollToTop: true,
  }),
}));

vi.mock("../ChatView/ChatMessagesList", () => ({
  ChatMessagesList: () => <div data-testid="chat-messages-list" />,
}));

vi.mock("../ChatView/ChatInputArea", () => ({
  ChatInputArea: () => <div data-testid="chat-input-area" />,
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: () => ({
    getTotalSize: () => 0,
    getVirtualItems: () => [],
  }),
}));

import { ChatView } from "../ChatView";

describe("ChatView scroll button group", () => {
  beforeEach(() => {
    mockStoreState.deleteMessage.mockReset();
    mockStoreState.updateChat.mockReset();
  });

  it("renders a FloatButton.Group with the expected fixed position", () => {
    const { container } = render(<ChatView />);
    const group = container.querySelector(".ant-float-btn-group");

    expect(group).toBeTruthy();
    expect((group as HTMLElement).style.bottom).toBe("180px");
    expect((group as HTMLElement).style.right).toBe("32px");
  });
});
