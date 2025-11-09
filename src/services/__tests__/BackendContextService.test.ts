/**
 * BackendContextService Unit Tests
 * Tests for the backend context service API client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BackendContextService } from '../BackendContextService';
import {
  createMockContext,
  createMockMessage,
  mockFetchResponse,
  mockFetchError,
  createMockEventSource,
  createMockSSEEvents,
  createMockStreamingChunksResponse,
} from '../../test/helpers';

describe('BackendContextService', () => {
  let service: BackendContextService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new BackendContextService();
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Context CRUD Operations', () => {
    it('should create a new context', async () => {
      const mockResponse = { id: 'new-context-id' };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.createContext({
        model_id: 'gpt-4',
        mode: 'general',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model_id: 'gpt-4',
            mode: 'general',
          }),
        })
      );
    });

    it('should get a context by ID', async () => {
      const mockContext = createMockContext();
      mockFetch.mockResolvedValue(mockFetchResponse(mockContext));

      const result = await service.getContext('test-context-id');

      expect(result).toEqual(mockContext);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id'),
        expect.any(Object)
      );
    });

    it('should update a context', async () => {
      mockFetch.mockResolvedValue(mockFetchResponse({}));

      await service.updateContext('test-context-id', {
        current_state: 'processing',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id'),
        expect.objectContaining({
          method: 'PUT',
        })
      );
    });

    it('should delete a context', async () => {
      mockFetch.mockResolvedValue(mockFetchResponse({}));

      await service.deleteContext('test-context-id');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('should list all contexts', async () => {
      const mockContexts = [createMockContext(), createMockContext({ id: 'context-2' })];
      mockFetch.mockResolvedValue(mockFetchResponse({ contexts: mockContexts }));

      const result = await service.listContexts();

      expect(result).toEqual(mockContexts);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts'),
        expect.any(Object)
      );
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValue(mockFetchError('Context not found', 404));

      await expect(service.getContext('nonexistent-id')).rejects.toThrow();
    });
  });

  describe('Message Operations', () => {
    it('should get messages for a context', async () => {
      const mockMessages = [createMockMessage(), createMockMessage({ id: 'msg-2' })];
      mockFetch.mockResolvedValue(
        mockFetchResponse({
          messages: mockMessages,
          total: 2,
          limit: 50,
          offset: 0,
        })
      );

      const result = await service.getMessages('test-context-id');

      expect(result.messages).toEqual(mockMessages);
      expect(result.total).toBe(2);
    });

    it('should get messages with query parameters', async () => {
      mockFetch.mockResolvedValue(
        mockFetchResponse({
          messages: [],
          total: 0,
          limit: 10,
          offset: 5,
        })
      );

      await service.getMessages('test-context-id', {
        branch: 'main',
        limit: 10,
        offset: 5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('branch=main&limit=10&offset=5'),
        expect.any(Object)
      );
    });

    it('should add a message to a context', async () => {
      mockFetch.mockResolvedValue(mockFetchResponse({}));

      await service.addMessage('test-context-id', {
        role: 'user',
        content: 'Hello',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/messages'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            role: 'user',
            content: 'Hello',
          }),
        })
      );
    });
  });

  describe('Action-Based API', () => {
    it('should send a message using action API', async () => {
      const mockResponse = {
        context: createMockContext(),
        status: 'idle',
      };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.sendMessageAction('test-context-id', 'Hello');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/actions/send_message'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ content: 'Hello' }),
        })
      );
    });

    it('should approve tools using action API', async () => {
      const mockResponse = {
        context: createMockContext(),
        status: 'processing',
      };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.approveToolsAction('test-context-id', ['tool-1', 'tool-2']);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/actions/approve_tools'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ tool_call_ids: ['tool-1', 'tool-2'] }),
        })
      );
    });

    it('should get chat state', async () => {
      const mockResponse = {
        context: createMockContext(),
        status: 'idle',
      };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.getChatState('test-context-id');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/state'),
        expect.any(Object)
      );
    });

    it('should update agent role', async () => {
      const mockResponse = {
        success: true,
        context_id: 'test-context-id',
        old_role: 'actor',
        new_role: 'planner',
        message: 'Role updated successfully',
      };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.updateAgentRole('test-context-id', 'planner');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/role'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ role: 'planner' }),
        })
      );
    });
  });

  describe('System Prompt Operations', () => {
    it('should create a system prompt', async () => {
      const mockResponse = { id: 'prompt-1' };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.createSystemPrompt('prompt-1', 'You are a helpful assistant');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/system-prompts'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should list system prompts', async () => {
      const mockPrompts = [
        { id: 'prompt-1', content: 'Prompt 1' },
        { id: 'prompt-2', content: 'Prompt 2' },
      ];
      mockFetch.mockResolvedValue(mockFetchResponse({ prompts: mockPrompts }));

      const result = await service.listSystemPrompts();

      expect(result).toEqual(mockPrompts);
    });

    it('should reload system prompts', async () => {
      mockFetch.mockResolvedValue(mockFetchResponse({ reloaded: 5 }));

      const result = await service.reloadSystemPrompts();

      expect(result.reloaded).toBe(5);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/system-prompts/reload'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });

  describe('Signal-Pull SSE Architecture', () => {
    it('should subscribe to context events', () => {
      const mockEventSource = createMockEventSource();
      global.EventSource = vi.fn(() => mockEventSource) as any;

      const onEvent = vi.fn();
      const unsubscribe = service.subscribeToContextEvents('test-context-id', onEvent);

      expect(global.EventSource).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/events')
      );

      // Cleanup
      unsubscribe();
      expect(mockEventSource.close).toHaveBeenCalled();
    });

    it('should parse content_delta events', () => {
      const mockEventSource = createMockEventSource();
      global.EventSource = vi.fn(() => mockEventSource) as any;

      const onEvent = vi.fn();
      service.subscribeToContextEvents('test-context-id', onEvent);

      // Simulate content_delta event by calling onmessage directly
      const eventData = {
        event_type: 'content_delta',
        message_id: 'msg-1',
        sequence: 5,
        timestamp: Date.now(),
      };

      // Trigger onmessage handler
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(new MessageEvent('message', {
          data: JSON.stringify(eventData),
        }));
      }

      expect(onEvent).toHaveBeenCalledWith(eventData);
    });

    it('should parse state_changed events', () => {
      const mockEventSource = createMockEventSource();
      global.EventSource = vi.fn(() => mockEventSource) as any;

      const onEvent = vi.fn();
      service.subscribeToContextEvents('test-context-id', onEvent);

      // Simulate state_changed event
      const eventData = {
        event_type: 'state_changed',
        new_state: 'processing',
        timestamp: Date.now(),
      };

      // Trigger onmessage handler
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(new MessageEvent('message', {
          data: JSON.stringify(eventData),
        }));
      }

      expect(onEvent).toHaveBeenCalledWith(eventData);
    });

    it('should parse message_completed events', () => {
      const mockEventSource = createMockEventSource();
      global.EventSource = vi.fn(() => mockEventSource) as any;

      const onEvent = vi.fn();
      service.subscribeToContextEvents('test-context-id', onEvent);

      // Simulate message_completed event
      const eventData = {
        event_type: 'message_completed',
        message_id: 'msg-1',
        final_sequence: 10,
        timestamp: Date.now(),
      };

      // Trigger onmessage handler
      if (mockEventSource.onmessage) {
        mockEventSource.onmessage(new MessageEvent('message', {
          data: JSON.stringify(eventData),
        }));
      }

      expect(onEvent).toHaveBeenCalledWith(eventData);
    });

    it('should handle SSE errors', () => {
      const mockEventSource = createMockEventSource();
      global.EventSource = vi.fn(() => mockEventSource) as any;

      const onEvent = vi.fn();
      const onError = vi.fn();
      service.subscribeToContextEvents('test-context-id', onEvent, onError);

      // Simulate error by calling onerror directly
      if (mockEventSource.onerror) {
        mockEventSource.onerror(new Event('error'));
      }

      expect(onError).toHaveBeenCalled();
    });

    it('should get message content (streaming chunks)', async () => {
      const mockChunks = createMockStreamingChunksResponse(['Hello', ' world', '!']);
      mockFetch.mockResolvedValue(mockFetchResponse(mockChunks));

      const result = await service.getMessageContent('test-context-id', 'msg-1', 0);

      expect(result).toEqual(mockChunks);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/messages/msg-1/streaming-chunks?from_sequence=0'),
        expect.any(Object)
      );
    });

    it('should get message content without from_sequence', async () => {
      const mockChunks = createMockStreamingChunksResponse(['Complete message']);
      mockFetch.mockResolvedValue(mockFetchResponse(mockChunks));

      await service.getMessageContent('test-context-id', 'msg-1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/messages/msg-1/streaming-chunks'),
        expect.any(Object)
      );
      expect(mockFetch).not.toHaveBeenCalledWith(
        expect.stringContaining('from_sequence'),
        expect.any(Object)
      );
    });

    it('should send a message (new Signal-Pull API)', async () => {
      mockFetch.mockResolvedValue(mockFetchResponse({}));

      await service.sendMessage('test-context-id', 'Hello world');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/actions/send_message'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            payload: {
              type: 'text',
              content: 'Hello world',
              display: null,
            },
            client_metadata: {},
          }),
        })
      );
    });
  });

  describe('Workspace Operations', () => {
    it('should set workspace path', async () => {
      const mockResponse = { workspace_path: '/test/workspace' };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.setWorkspacePath('test-context-id', '/test/workspace');

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/workspace'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ workspace_path: '/test/workspace' }),
        })
      );
    });

    it('should get workspace path', async () => {
      const mockResponse = { workspace_path: '/test/workspace' };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.getWorkspacePath('test-context-id');

      expect(result).toEqual(mockResponse);
    });

    it('should get workspace files', async () => {
      const mockResponse = {
        workspace_path: '/test/workspace',
        files: [
          { name: 'file1.txt', path: '/test/workspace/file1.txt', is_directory: false },
          { name: 'dir1', path: '/test/workspace/dir1', is_directory: true },
        ],
      };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.getWorkspaceFiles('test-context-id');

      expect(result).toEqual(mockResponse);
      expect(result.files).toHaveLength(2);
    });
  });

  describe('Title Generation', () => {
    it('should generate a title for a context', async () => {
      const mockResponse = { title: 'Generated Title' };
      mockFetch.mockResolvedValue(mockFetchResponse(mockResponse));

      const result = await service.generateTitle('test-context-id', {
        maxLength: 50,
        messageLimit: 10,
        fallbackTitle: 'Fallback',
      });

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/contexts/test-context-id/generate-title'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });
  });
});

