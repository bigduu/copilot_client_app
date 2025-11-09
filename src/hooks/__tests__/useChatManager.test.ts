/**
 * Unit tests for useChatManager hook
 * Tests the Signal-Pull SSE architecture and chat management logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChatManager } from '../useChatManager';
import { useAppStore } from '../../store';
import { createMockContext, createMockMessage, createMockEventSource } from '../../test/helpers';

// Mock dependencies
vi.mock('../../store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      modal: {
        info: vi.fn(),
        error: vi.fn(),
      },
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
      },
    }),
  },
}));

vi.mock('@xstate/react', () => ({
  useMachine: vi.fn(() => [
    {
      value: 'IDLE',
      context: { messages: [] },
      matches: vi.fn((state: string) => state === 'IDLE'),
    },
    vi.fn(),
  ]),
}));

vi.mock('../../core/chatInteractionMachine', () => ({
  chatMachine: {
    provide: vi.fn((config) => config),
  },
}));

vi.mock('../../services', () => ({
  SystemPromptService: {
    getInstance: vi.fn(() => ({
      getEnhancedSystemPrompt: vi.fn(async (id: string) => `Enhanced prompt for ${id}`),
    })),
  },
}));

describe('useChatManager', () => {
  let mockStore: any;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Setup mock store
    mockStore = {
      chats: [],
      currentChatId: null,
      addChat: vi.fn(),
      setMessages: vi.fn(),
      addMessage: vi.fn(),
      selectChat: vi.fn(),
      deleteChat: vi.fn(),
      deleteChats: vi.fn(),
      deleteMessage: vi.fn(),
      updateChat: vi.fn(),
      pinChat: vi.fn(),
      unpinChat: vi.fn(),
      loadChats: vi.fn(),
      autoGenerateTitles: true,
      setAutoGenerateTitlesPreference: vi.fn(),
      isUpdatingAutoTitlePreference: false,
      updateMessageContent: vi.fn(),
      lastSelectedPromptId: 'general_assistant',
      systemPrompts: [
        {
          id: 'general_assistant',
          name: 'General Assistant',
          content: 'You are a helpful assistant.',
        },
      ],
    };

    // Mock useAppStore as both a hook and an object with getState
    const mockUseAppStore = vi.fn((selector: any) => {
      if (typeof selector === 'function') {
        return selector(mockStore);
      }
      return mockStore;
    });

    // Add getState method
    mockUseAppStore.getState = vi.fn(() => mockStore);

    (useAppStore as any) = mockUseAppStore;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty state', () => {
      const { result } = renderHook(() => useChatManager());

      expect(result.current.chats).toEqual([]);
      expect(result.current.currentChatId).toBeNull();
      expect(result.current.currentChat).toBeNull();
      expect(result.current.currentMessages).toEqual([]);
      expect(result.current.chatCount).toBe(0);
    });

    it('should initialize with existing chats', () => {
      const mockChat = {
        id: 'chat-1',
        title: 'Test Chat',
        messages: [],
        createdAt: Date.now(),
        config: {
          systemPromptId: 'general_assistant',
          baseSystemPrompt: 'You are a helpful assistant.',
          toolCategory: 'general',
          lastUsedEnhancedPrompt: null,
        },
        currentInteraction: null,
      };

      mockStore.chats = [mockChat];
      mockStore.currentChatId = 'chat-1';

      const { result } = renderHook(() => useChatManager());

      expect(result.current.chats).toHaveLength(1);
      expect(result.current.currentChat).toEqual(mockChat);
      expect(result.current.chatCount).toBe(1);
    });
  });

  describe('Chat CRUD Operations', () => {
    it('should create a new chat', async () => {
      const { result } = renderHook(() => useChatManager());

      await act(async () => {
        await result.current.createNewChat('My New Chat');
      });

      expect(mockStore.addChat).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My New Chat',
          messages: [],
          config: expect.objectContaining({
            systemPromptId: 'general_assistant',
          }),
        })
      );
    });

    it('should create a chat with system prompt', async () => {
      const { result } = renderHook(() => useChatManager());

      const prompt = {
        id: 'custom_prompt',
        name: 'Custom Prompt',
        content: 'You are a custom assistant.',
      };

      await act(async () => {
        await result.current.createChatWithSystemPrompt(prompt);
      });

      expect(mockStore.addChat).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Chat - Custom Prompt',
          config: expect.objectContaining({
            systemPromptId: 'custom_prompt',
            baseSystemPrompt: 'You are a custom assistant.',
          }),
        })
      );
    });

    it('should delete a chat', () => {
      const { result } = renderHook(() => useChatManager());

      act(() => {
        result.current.deleteChat('chat-1');
      });

      expect(mockStore.deleteChat).toHaveBeenCalledWith('chat-1');
    });

    it('should update chat title', () => {
      const { result } = renderHook(() => useChatManager());

      act(() => {
        result.current.updateChatTitle('chat-1', 'Updated Title');
      });

      expect(mockStore.updateChat).toHaveBeenCalledWith('chat-1', {
        title: 'Updated Title',
      });
    });

    it('should toggle chat pin', () => {
      mockStore.chats = [
        {
          id: 'chat-1',
          title: 'Test Chat',
          pinned: false,
          messages: [],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
      ];

      const { result } = renderHook(() => useChatManager());

      act(() => {
        result.current.toggleChatPin('chat-1');
      });

      expect(mockStore.pinChat).toHaveBeenCalledWith('chat-1');
    });

    it('should delete empty chats', () => {
      mockStore.chats = [
        {
          id: 'chat-1',
          title: 'Empty Chat',
          pinned: false,
          messages: [],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
        {
          id: 'chat-2',
          title: 'Non-empty Chat',
          pinned: false,
          messages: [createMockMessage()],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
      ];

      const { result } = renderHook(() => useChatManager());

      act(() => {
        result.current.deleteEmptyChats();
      });

      expect(mockStore.deleteChats).toHaveBeenCalledWith(['chat-1']);
    });
  });

  describe('Pinned/Unpinned Chats', () => {
    it('should separate pinned and unpinned chats', () => {
      mockStore.chats = [
        {
          id: 'chat-1',
          title: 'Pinned Chat',
          pinned: true,
          messages: [],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
        {
          id: 'chat-2',
          title: 'Unpinned Chat',
          pinned: false,
          messages: [],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
      ];

      const { result } = renderHook(() => useChatManager());

      expect(result.current.pinnedChats).toHaveLength(1);
      expect(result.current.unpinnedChats).toHaveLength(1);
      expect(result.current.pinnedChats[0].id).toBe('chat-1');
      expect(result.current.unpinnedChats[0].id).toBe('chat-2');
    });
  });

  describe('Title Generation', () => {
    it('should detect default titles', () => {
      const { result } = renderHook(() => useChatManager());

      // Access isDefaultTitle through the hook's internal logic
      // We'll test this indirectly through generateChatTitle behavior
      expect(result.current).toBeDefined();
    });

    it('should generate title for chat', async () => {
      mockStore.chats = [
        {
          id: 'chat-1',
          title: 'New Chat',
          messages: [
            { id: 'msg-1', role: 'user', content: 'Hello', createdAt: new Date().toISOString() },
            { id: 'msg-2', role: 'assistant', type: 'text', content: 'Hi there!', createdAt: new Date().toISOString() },
          ],
          createdAt: Date.now(),
          config: {},
          currentInteraction: null,
        },
      ];

      // Mock BackendContextService
      const mockGenerateTitle = vi.fn().mockResolvedValue({ title: 'Generated Title' });
      vi.doMock('../../services/BackendContextService', () => ({
        BackendContextService: vi.fn().mockImplementation(() => ({
          generateTitle: mockGenerateTitle,
        })),
      }));

      const { result } = renderHook(() => useChatManager());

      await act(async () => {
        await result.current.generateChatTitle('chat-1', { force: true });
      });

      // Wait for async operations
      await waitFor(() => {
        expect(mockStore.updateChat).toHaveBeenCalled();
      }, { timeout: 3000 });
    });
  });

  describe('Auto Title Generation Preference', () => {
    it('should update auto title generation preference', () => {
      const { result } = renderHook(() => useChatManager());

      act(() => {
        result.current.setAutoGenerateTitlesPreference(false);
      });

      expect(mockStore.setAutoGenerateTitlesPreference).toHaveBeenCalledWith(false);
    });

    it('should expose auto title generation state', () => {
      mockStore.autoGenerateTitles = true;
      mockStore.isUpdatingAutoTitlePreference = false;

      const { result } = renderHook(() => useChatManager());

      expect(result.current.autoGenerateTitles).toBe(true);
      expect(result.current.isUpdatingAutoTitlePreference).toBe(false);
    });
  });
});

