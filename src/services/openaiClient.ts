import OpenAI from "openai";

import { getBackendBaseUrl } from "../utils/backendBaseUrl";

let client: OpenAI | null = null;
let currentBaseUrl: string | null = null;

export const getOpenAIClient = (): OpenAI => {
  const baseURL = getBackendBaseUrl();
  if (!client) {
    client = new OpenAI({
      apiKey: "local",
      baseURL,
      dangerouslyAllowBrowser: true,
    });
    currentBaseUrl = baseURL;
  } else if (currentBaseUrl !== baseURL) {
    client = new OpenAI({
      apiKey: "local",
      baseURL,
      dangerouslyAllowBrowser: true,
    });
    currentBaseUrl = baseURL;
  }
  return client;
};
