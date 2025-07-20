import { invoke, Channel } from '@tauri-apps/api/core';
import { Message } from '../types/chat';

export const tauriService = {
  /**
   * Execute AI prompt with streaming response
   */
  async executePrompt(
    messages: Message[],
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const channel = new Channel<string>();
      
      if (onChunk) {
        channel.onmessage = onChunk;
      }
      
      invoke('execute_prompt', {
        messages,
        model,
        channel
      })
      .then(() => resolve())
      .catch(reject);
    });
  },

  /**
   * Get available AI models
   */
  async getModels(): Promise<string[]> {
    try {
      return await invoke('get_models');
    } catch (error) {
      console.error('Failed to get models:', error);
      return [];
    }
  },

  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<any[]> {
    try {
      return await invoke('get_available_tools');
    } catch (error) {
      console.error('Failed to get tools:', error);
      return [];
    }
  },

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, parameters: any): Promise<any> {
    try {
      return await invoke('execute_tool', { toolName, parameters });
    } catch (error) {
      console.error('Failed to execute tool:', error);
      throw error;
    }
  },

  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    try {
      await invoke('copy_to_clipboard', { text });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      throw error;
    }
  }
};
