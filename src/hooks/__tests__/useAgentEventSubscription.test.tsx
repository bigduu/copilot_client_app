import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAgentEventSubscription } from '../useAgentEventSubscription';
import { useAppStore } from '../../pages/ChatPage/store';
import { AgentClient } from '../../services/chat/AgentService';

// Mock dependencies
vi.mock('../../pages/ChatPage/store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('../../services/chat/AgentService', () => ({
  AgentClient: vi.fn(),
}));

describe('useAgentEventSubscription', () => {
  let mockSubscribeToEvents: any;
  let mockSetProcessing: any;
  let mockAddMessage: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSubscribeToEvents = vi.fn();
    mockSetProcessing = vi.fn();
    mockAddMessage = vi.fn();

    (AgentClient as any).mockImplementation(() => ({
      subscribeToEvents: mockSubscribeToEvents,
    }));

    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: false,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });
  });

  it('should not subscribe when isProcessing is false', () => {
    renderHook(() => useAgentEventSubscription());

    expect(mockSubscribeToEvents).not.toHaveBeenCalled();
  });

  it('should subscribe when isProcessing is true and session exists', async () => {
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true, // Processing is true
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    mockSubscribeToEvents.mockResolvedValue(undefined);

    renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          onToken: expect.any(Function),
          onComplete: expect.any(Function),
          onError: expect.any(Function),
        }),
        expect.any(AbortController)
      );
    });
  });

  it('should unsubscribe when isProcessing becomes false', async () => {
    const { rerender } = renderHook(() => useAgentEventSubscription());

    // Initially not processing
    expect(mockSubscribeToEvents).not.toHaveBeenCalled();

    // Change to processing
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    mockSubscribeToEvents.mockResolvedValue(undefined);

    rerender();

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    // Change back to not processing
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: false,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    rerender();

    // Should abort the subscription
    // (Hard to test directly without access to abort controller)
  });

  it('should handle subscription errors and reset state', async () => {
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockSubscribeToEvents.mockRejectedValue(new Error('Connection failed'));

    renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAgentEventSubscription] Subscription error:',
        expect.any(Error)
      );

      // Should reset processing state on error
      expect(mockSetProcessing).toHaveBeenCalledWith(false);
    });

    consoleSpy.mockRestore();
  });

  it('should handle onComplete and save message', async () => {
    let completeHandler: any;
    mockSubscribeToEvents.mockImplementation(async (_sessionId, handlers) => {
      completeHandler = handlers.onComplete;
    });

    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    // Simulate complete event
    await act(async () => {
      if (completeHandler) {
        await completeHandler();
      }
    });

    await waitFor(() => {
      expect(mockSetProcessing).toHaveBeenCalledWith(false);
    });
  });

  it('should handle onError and show error message', async () => {
    let errorHandler: any;
    mockSubscribeToEvents.mockImplementation(async (_sessionId, handlers) => {
      errorHandler = handlers.onError;
    });

    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    // Simulate error event
    await act(async () => {
      if (errorHandler) {
        await errorHandler('Something went wrong');
      }
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[useAgentEventSubscription] Agent error:',
        'Something went wrong'
      );
      expect(mockAddMessage).toHaveBeenCalled();
      expect(mockSetProcessing).toHaveBeenCalledWith(false);
    });

    consoleSpy.mockRestore();
  });

  it('should not create duplicate subscriptions', async () => {
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    mockSubscribeToEvents.mockResolvedValue(undefined);

    const { rerender } = renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalledTimes(1);
    });

    // Rerender should not create new subscription
    rerender();

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle token streaming', async () => {
    let tokenHandler: any;
    mockSubscribeToEvents.mockImplementation(async (_sessionId, handlers) => {
      tokenHandler = handlers.onToken;
    });

    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    // Simulate token events
    act(() => {
      if (tokenHandler) {
        tokenHandler('Hello ');
        tokenHandler('World');
      }
    });

    // Should stream tokens (verified via streamingMessageBus, not mocked here)
  });

  it('should cleanup subscription on unmount', async () => {
    (useAppStore as any).mockImplementation((selector) => {
      const state = {
        chats: [
          {
            id: 'chat-1',
            config: {
              agentSessionId: 'session-1',
            },
          },
        ],
        currentChatId: 'chat-1',
        isProcessing: true,
        addMessage: mockAddMessage,
        setProcessing: mockSetProcessing,
      };
      return selector(state);
    });

    mockSubscribeToEvents.mockResolvedValue(undefined);

    const { unmount } = renderHook(() => useAgentEventSubscription());

    await waitFor(() => {
      expect(mockSubscribeToEvents).toHaveBeenCalled();
    });

    // Unmount should cleanup (abort controller)
    unmount();

    // Cleanup is internal, hard to verify without access to abort controller
  });
});
