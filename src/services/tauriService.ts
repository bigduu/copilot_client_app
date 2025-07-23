import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';

export const TauriService = {
  /**
   * Execute a prompt with streaming response
   */
  async executePrompt(
    messages: any[],
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<void> {
    const channel = new Channel<string>();
    
    if (onChunk) {
      channel.onmessage = (message) => {
        onChunk(message);
      };
    }

    await invoke('execute_prompt', {
      messages,
      model,
      channel,
    });
  },

  /**
   * Get available models
   */
  async getModels(): Promise<string[]> {
    return await invoke('get_models');
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await invoke('copy_to_clipboard', { text });
  },

  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<any[]> {
    return await invoke('get_available_tools');
  },

  /**
   * Get tools documentation
   */
  async getToolsDocumentation(): Promise<any> {
    return await invoke('get_tools_documentation');
  },

  /**
   * Get tools for UI
   */
  async getToolsForUI(): Promise<any[]> {
    return await invoke('get_tools_for_ui');
  },

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: any[]): Promise<any> {
    return await invoke('execute_tool', {
      tool_name: toolName,
      parameters,
    });
  },

  /**
   * Get tool categories
   */
  async getToolCategories(): Promise<any[]> {
    return await invoke('get_tool_categories');
  },

  /**
   * Get tools by category
   */
  async getCategoryTools(categoryId: string): Promise<any[]> {
    return await invoke('get_category_tools', {
      categoryId,
    });
  },

  /**
   * Get category information by ID
   */
  async getToolCategoryInfo(categoryId: string): Promise<any> {
    return await invoke('get_tool_category_info', {
      categoryId,
    });
  },

  /**
   * Get category system prompt
   */
  async getCategorySystemPrompt(categoryId: string): Promise<string> {
    return await invoke('get_category_system_prompt', {
      categoryId,
    });
  },

  /**
   * Get MCP servers
   */
  async getMcpServers(): Promise<any> {
    return await invoke('get_mcp_servers');
  },

  /**
   * Set MCP servers
   */
  async setMcpServers(servers: any): Promise<void> {
    await invoke('set_mcp_servers', { servers });
  },

  /**
   * Get MCP client status
   */
  async getMcpClientStatus(): Promise<any> {
    return await invoke('get_mcp_client_status');
  },

  /**
   * Generic invoke method for custom commands
   */
  async invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
    return await invoke(command, args);
  },

  /**
   * Create a channel for streaming responses
   */
  createChannel<T>(): Channel<T> {
    return new Channel<T>();
  },
};
