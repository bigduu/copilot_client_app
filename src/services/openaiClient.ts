import OpenAI from "openai";

let client: OpenAI | null = null;

export const getOpenAIClient = (): OpenAI => {
  if (!client) {
    client = new OpenAI({
      apiKey: "local",
      baseURL: "http://127.0.0.1:8080/v1",
      dangerouslyAllowBrowser: true,
    });
  }
  return client;
};
