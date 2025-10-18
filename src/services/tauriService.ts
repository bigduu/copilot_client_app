import { invoke } from "@tauri-apps/api/core";
import { Channel } from "@tauri-apps/api/core";
import { UtilityService, Message } from "./types";

export class TauriChatService {
  /**
   * Execute a prompt with streaming response
   */
  async executePrompt(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    const channel = new Channel<string>();
    let cancelled = false;

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        cancelled = true;
        console.log("[Tauri] Request was cancelled");

        // Immediately send cancellation signal
        if (onChunk) {
          onChunk("[CANCELLED]");
        }
      });
    }

    if (onChunk) {
      channel.onmessage = (message) => {
        // Check if request was cancelled before processing message
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
        // Don't send [CANCELLED] here as it's already sent in abort listener
        return; // Don't throw for cancelled requests
      }
      throw error;
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    return await invoke("get_models");
  }
}

export class TauriUtilityService implements UtilityService {
  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await invoke("copy_to_clipboard", { text });
  }

  /**
   * Get MCP servers
   */
  async getMcpServers(): Promise<any> {
    return await invoke("get_mcp_servers");
  }

  /**
   * Set MCP servers
   */
  async setMcpServers(servers: any): Promise<void> {
    await invoke("set_mcp_servers", { servers });
  }

  /**
   * Get MCP client status
   */
  async getMcpClientStatus(name: string): Promise<any> {
    return await invoke("get_mcp_client_status", { name });
  }

  /**
   * Generic invoke method for custom commands
   */
  async invoke<T = any>(
    command: string,
    args?: Record<string, any>
  ): Promise<T> {
    return await invoke(command, args);
  }
}
