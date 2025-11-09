/**
 * Test Helper Functions
 * Utilities for creating test data and mocking API responses
 */

import { vi } from 'vitest';
import type { ChatContextDTO, MessageDTO } from '../services/BackendContextService';

/**
 * Create a mock ChatContextDTO for testing
 */
export function createMockContext(overrides?: Partial<ChatContextDTO>): ChatContextDTO {
  return {
    id: 'test-context-id',
    config: {
      model_id: 'gpt-4',
      mode: 'general',
      parameters: {},
      agent_role: 'actor',
      workspace_path: '/test/workspace',
    },
    current_state: 'idle',
    active_branch_name: 'main',
    message_count: 0,
    branches: [
      {
        name: 'main',
        message_count: 0,
      },
    ],
    ...overrides,
  };
}

/**
 * Create a mock MessageDTO for testing
 */
export function createMockMessage(overrides?: Partial<MessageDTO>): MessageDTO {
  return {
    id: 'test-message-id',
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Test message',
      },
    ],
    message_type: 'text',
    ...overrides,
  };
}

/**
 * Create a mock assistant message with streaming chunks
 */
export function createMockAssistantMessage(text: string): MessageDTO {
  return {
    id: 'assistant-message-id',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    message_type: 'text',
  };
}

/**
 * Mock fetch response helper
 */
export function mockFetchResponse(data: any, options?: { ok?: boolean; status?: number }) {
  return {
    ok: options?.ok ?? true,
    status: options?.status ?? 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  } as Response;
}

/**
 * Mock fetch error helper
 */
export function mockFetchError(message: string, status: number = 500) {
  return {
    ok: false,
    status,
    statusText: message,
    json: async () => ({ error: message }),
    text: async () => JSON.stringify({ error: message }),
    headers: new Headers({
      'content-type': 'application/json',
    }),
  } as Response;
}

/**
 * Create a mock EventSource for testing SSE
 */
export function createMockEventSource() {
  const listeners = new Map<string, Set<EventListener>>();

  const mockEventSource = {
    url: '',
    readyState: 1, // OPEN
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null as ((event: Event) => void) | null,
    onopen: null as ((event: Event) => void) | null,
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)!.add(listener);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListener) => {
      const typeListeners = listeners.get(type);
      if (typeListeners) {
        typeListeners.delete(listener);
      }
    }),
    close: vi.fn(),
    dispatchEvent: vi.fn((event: Event) => {
      const typeListeners = listeners.get(event.type);
      if (typeListeners) {
        typeListeners.forEach((listener) => listener(event));
      }
      return true;
    }),
    // Helper to simulate server events
    simulateEvent: (type: string, data: any) => {
      const event = new MessageEvent(type, {
        data: JSON.stringify(data),
      });
      const typeListeners = listeners.get(type);
      if (typeListeners) {
        typeListeners.forEach((listener) => listener(event));
      }
    },
  };

  return mockEventSource;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean,
  options?: { timeout?: number; interval?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 1000;
  const interval = options?.interval ?? 50;
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Create mock SSE events for testing Signal-Pull flow
 */
export function createMockSSEEvents() {
  return {
    stateChanged: (state: string) => ({
      event_type: 'state_changed',
      new_state: state,
      timestamp: Date.now(),
    }),
    contentDelta: (messageId: string, sequence: number) => ({
      event_type: 'content_delta',
      message_id: messageId,
      sequence,
      timestamp: Date.now(),
    }),
    messageCompleted: (messageId: string, finalSequence: number) => ({
      event_type: 'message_completed',
      message_id: messageId,
      final_sequence: finalSequence,
      timestamp: Date.now(),
    }),
    heartbeat: () => ({
      event_type: 'heartbeat',
      timestamp: Date.now(),
    }),
  };
}

/**
 * Create mock streaming chunks response
 */
export function createMockStreamingChunksResponse(chunks: string[]) {
  return {
    context_id: 'test-context-id',
    message_id: 'test-message-id',
    chunks: chunks.map((delta, index) => ({
      sequence: index,
      delta,
    })),
    current_sequence: chunks.length - 1,
    has_more: false,
  };
}

