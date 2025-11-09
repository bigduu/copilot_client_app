/**
 * Vitest Setup File
 * Configures global mocks and test utilities
 */

import { afterEach, vi } from 'vitest';

// Mock EventSource for SSE tests
class MockEventSource {
  url: string;
  listeners: Map<string, Set<EventListener>>;
  readyState: number;
  CONNECTING = 0;
  OPEN = 1;
  CLOSED = 2;

  constructor(url: string) {
    this.url = url;
    this.listeners = new Map();
    this.readyState = this.CONNECTING;
    
    // Simulate connection opening
    setTimeout(() => {
      this.readyState = this.OPEN;
      this.dispatchEvent(new Event('open'));
    }, 0);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  dispatchEvent(event: Event) {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((listener) => listener(event));
    }
    return true;
  }

  close() {
    this.readyState = this.CLOSED;
    this.dispatchEvent(new Event('close'));
  }

  // Helper method for tests to simulate server events
  simulateMessage(type: string, data: any) {
    const event = new MessageEvent(type, {
      data: JSON.stringify(data),
    });
    this.dispatchEvent(event);
  }
}

// Install global mocks
global.EventSource = MockEventSource as any;

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock Tauri API
global.__TAURI__ = {
  invoke: vi.fn(),
  event: {
    listen: vi.fn(),
    emit: vi.fn(),
  },
} as any;

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any;

