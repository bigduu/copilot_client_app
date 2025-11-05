const LEGACY_KEYS = {
  CHATS: "copilot_chats_v2",
  MESSAGES_PREFIX: "copilot_messages_v2_",
  LATEST_ACTIVE_CHAT: "copilot_latest_active_chat_id_v2",
  SYSTEM_PROMPTS: "copilot_system_prompts_v1",
};

export function cleanupLegacyStorage(): { removedKeys: string[] } {
  const removedKeys: string[] = [];

  try {
    // Remove chat index
    if (localStorage.getItem(LEGACY_KEYS.CHATS) !== null) {
      localStorage.removeItem(LEGACY_KEYS.CHATS);
      removedKeys.push(LEGACY_KEYS.CHATS);
    }

    // Remove latest active chat
    if (localStorage.getItem(LEGACY_KEYS.LATEST_ACTIVE_CHAT) !== null) {
      localStorage.removeItem(LEGACY_KEYS.LATEST_ACTIVE_CHAT);
      removedKeys.push(LEGACY_KEYS.LATEST_ACTIVE_CHAT);
    }

    // Remove system prompts
    if (localStorage.getItem(LEGACY_KEYS.SYSTEM_PROMPTS) !== null) {
      localStorage.removeItem(LEGACY_KEYS.SYSTEM_PROMPTS);
      removedKeys.push(LEGACY_KEYS.SYSTEM_PROMPTS);
    }

    // Remove per-chat messages
    const messageKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(LEGACY_KEYS.MESSAGES_PREFIX)) messageKeys.push(key);
    }
    for (const key of messageKeys) {
      localStorage.removeItem(key);
      removedKeys.push(key);
    }
  } catch (err) {
    console.error("cleanupLegacyStorage error:", err);
  }

  return { removedKeys };
}
