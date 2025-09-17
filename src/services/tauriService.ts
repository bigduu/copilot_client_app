import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { ToolService, UtilityService, Message } from './types';

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
      abortSignal.addEventListener('abort', () => {
        cancelled = true;
        console.log('[Tauri] Request was cancelled');

        // Immediately send cancellation signal
        if (onChunk) {
          onChunk('[CANCELLED]');
        }
      });
    }

    if (onChunk) {
      channel.onmessage = (message) => {
        // Check if request was cancelled before processing message
        if (cancelled) {
          console.log('[Tauri] Ignoring message due to cancellation');
          return;
        }
        onChunk(message);
      };
    }

    try {
      await invoke('execute_prompt', {
        messages,
        model,
        channel,
      });
    } catch (error) {
      if (cancelled) {
        console.log('[Tauri] Request was cancelled during execution');
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
    return await invoke('get_models');
  }
}

export class TauriToolService implements ToolService {
  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<any[]> {
    return await invoke('get_available_tools');
  }

  /**
   * Get tools documentation
   */
  async getToolsDocumentation(): Promise<any> {
    return await invoke('get_tools_documentation');
  }

  /**
   * Get tools for UI
   */
  async getToolsForUI(): Promise<any[]> {
    return await invoke('get_tools_for_ui');
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: any[]): Promise<any> {
    return await invoke('execute_tool', {
      tool_name: toolName,
      parameters,
    });
  }

  /**
   * Get tool categories
   */
  async getToolCategories(): Promise<any[]> {
    return await invoke('get_tool_categories');
  }

  /**
   * Get tools by category
   */
  async getCategoryTools(categoryId: string): Promise<any[]> {
    return await invoke('get_category_tools', {
      categoryId,
    });
  }

  /**
   * Get category information by ID
   */
  async getToolCategoryInfo(categoryId: string): Promise<any> {
    return await invoke('get_tool_category_info', {
      categoryId,
    });
  }

  /**
   * Get category system prompt
   */
  async getCategorySystemPrompt(categoryId: string): Promise<string> {
    return await invoke('get_category_system_prompt', {
      categoryId,
    });
  }
}

export class TauriUtilityService implements UtilityService {
  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await invoke('copy_to_clipboard', { text });
  }

  /**
   * Get MCP servers
   */
  async getMcpServers(): Promise<any> {
    return await invoke('get_mcp_servers');
  }

  /**
   * Set MCP servers
   */
  async setMcpServers(servers: any): Promise<void> {
    await invoke('set_mcp_servers', { servers });
  }

  /**
   * Get MCP client status
   */
  async getMcpClientStatus(): Promise<any> {
    return await invoke('get_mcp_client_status');
  }

  /**
   * Generic invoke method for custom commands
   */
  async invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
    return await invoke(command, args);
  }
}
