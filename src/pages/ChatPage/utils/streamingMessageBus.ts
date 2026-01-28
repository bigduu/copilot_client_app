type StreamingMessageUpdate = {
  chatId: string;
  messageId: string;
  content: string | null;
};

type StreamingMessageListener = (content: string | null) => void;
type StreamingUpdateListener = (update: StreamingMessageUpdate) => void;

const messageListeners = new Map<string, Set<StreamingMessageListener>>();
const updateListeners = new Set<StreamingUpdateListener>();
const latestContent = new Map<string, string>();
const pendingUpdates = new Map<string, StreamingMessageUpdate>();
let rafHandle: number | null = null;

const notifyMessage = (messageId: string, content: string | null) => {
  const listeners = messageListeners.get(messageId);
  if (!listeners) return;
  listeners.forEach((listener) => listener(content));
};

const flushPending = () => {
  rafHandle = null;
  if (pendingUpdates.size === 0) return;
  const updates = Array.from(pendingUpdates.values());
  pendingUpdates.clear();
  updates.forEach((update) => {
    notifyMessage(update.messageId, update.content);
    updateListeners.forEach((listener) => listener(update));
  });
};

export const streamingMessageBus = {
  getLatest(messageId: string) {
    return latestContent.get(messageId) ?? null;
  },
  subscribeMessage(messageId: string, listener: StreamingMessageListener) {
    let listeners = messageListeners.get(messageId);
    if (!listeners) {
      listeners = new Set();
      messageListeners.set(messageId, listeners);
    }
    listeners.add(listener);
    if (latestContent.has(messageId)) {
      listener(latestContent.get(messageId) ?? null);
    }
    return () => {
      const current = messageListeners.get(messageId);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) {
        messageListeners.delete(messageId);
      }
    };
  },
  subscribe(listener: StreamingUpdateListener) {
    updateListeners.add(listener);
    return () => {
      updateListeners.delete(listener);
    };
  },
  publish(update: StreamingMessageUpdate) {
    if (update.content === null) {
      latestContent.delete(update.messageId);
    } else {
      latestContent.set(update.messageId, update.content);
    }
    pendingUpdates.set(update.messageId, update);
    if (rafHandle === null) {
      rafHandle = requestAnimationFrame(flushPending);
    }
  },
  clear(chatId: string, messageId: string) {
    latestContent.delete(messageId);
    pendingUpdates.delete(messageId);
    notifyMessage(messageId, null);
    updateListeners.forEach((listener) =>
      listener({ chatId, messageId, content: null }),
    );
  },
};
