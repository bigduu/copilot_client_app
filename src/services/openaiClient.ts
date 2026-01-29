import OpenAI from "openai";

import { getBackendBaseUrl } from "../utils/backendBaseUrl";

let client: OpenAI | null = null;
let currentBaseUrl: string | null = null;
let currentChatId: string | null = null;

export const getOpenAIClient = (chatId?: string): OpenAI => {
  const baseURL = getBackendBaseUrl();
  const needsNewClient =
    !client ||
    currentBaseUrl !== baseURL ||
    currentChatId !== (chatId ?? null);

  if (needsNewClient) {
    const headers: Record<string, string> = {};
    if (chatId) {
      headers["X-Chat-Id"] = chatId;
    }

    client = new OpenAI({
      apiKey: "local",
      baseURL,
      dangerouslyAllowBrowser: true,
      defaultHeaders: headers,
    });
    currentBaseUrl = baseURL;
    currentChatId = chatId ?? null;
  }
  return client;
};
