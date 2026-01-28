import { invoke, Channel } from "@tauri-apps/api/core";
import { buildBackendUrl } from "../../shared/utils/backendBaseUrl";

interface MessageContent {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
}

interface Message {
  role: string;
  content: string | MessageContent[];
}

export class TauriChatService {
  async executePrompt(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    const channel = new Channel<string>();
    let cancelled = false;

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        cancelled = true;
        console.log("[Tauri] Request was cancelled");

        if (onChunk) {
          onChunk("[CANCELLED]");
        }
      });
    }

    if (onChunk) {
      channel.onmessage = (message) => {
        if (cancelled) {
          console.log("[Tauri] Ignoring message due to cancellation");
          return;
        }
        onChunk(message);
      };
    }

    try {
      await invoke("execute_prompt", {
        messages,
        model,
        channel,
      });
    } catch (error) {
      if (cancelled) {
        console.log("[Tauri] Request was cancelled during execution");
        return;
      }
      throw error;
    }
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(buildBackendUrl("/models"));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.data.map((model: any) => model.id);
    } catch (error) {
      console.error("Failed to fetch models from HTTP API:", error);
      throw error;
    }
  }
}
