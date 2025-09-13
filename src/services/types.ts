// Common types for both service implementations
export interface Message {
  role: string;
  content: string | MessageContent[];
}

export interface MessageContent {
  type: string;
  text?: string;
  image_url?: {
    url: string;
    detail?: string;
  };
}


export interface ToolService {
  /**
   * Get available tools
   */
  getAvailableTools(): Promise<any[]>;

  /**
   * Get tools documentation
   */
  getToolsDocumentation(): Promise<any>;

  /**
   * Get tools for UI
   */
  getToolsForUI(): Promise<any[]>;

  /**
   * Execute a tool
   */
  executeTool(toolName: string, parameters: any[]): Promise<any>;

  /**
   * Get tool categories
   */
  getToolCategories(): Promise<any[]>;

  /**
   * Get tools by category
   */
  getCategoryTools(categoryId: string): Promise<any[]>;

  /**
   * Get category information by ID
   */
  getToolCategoryInfo(categoryId: string): Promise<any>;

  /**
   * Get category system prompt
   */
  getCategorySystemPrompt(categoryId: string): Promise<string>;
}

export interface UtilityService {
  /**
   * Copy text to clipboard
   */
  copyToClipboard(text: string): Promise<void>;

  /**
   * Get MCP servers
   */
  getMcpServers(): Promise<any>;

  /**
   * Set MCP servers
   */
  setMcpServers(servers: any): Promise<void>;

  /**
   * Get MCP client status
   */
  getMcpClientStatus(): Promise<any>;

  /**
   * Generic invoke method for custom commands
   */
  invoke<T = any>(command: string, args?: Record<string, any>): Promise<T>;
}

export type ServiceMode = 'tauri' | 'openai';
