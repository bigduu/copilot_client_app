import type { UserSystemPrompt } from "../types/chat";

const DEFAULT_SYSTEM_PROMPT: UserSystemPrompt = {
  id: "local_default",
  name: "Default",
  description: "Default system prompt.",
  content: "You are a helpful assistant.",
  isDefault: true,
};

export const getDefaultSystemPrompts = (): UserSystemPrompt[] => [
  { ...DEFAULT_SYSTEM_PROMPT },
];
