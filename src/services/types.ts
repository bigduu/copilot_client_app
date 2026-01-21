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
  getMcpClientStatus(name: string): Promise<any>;

  /**
   * Reload MCP servers
   */
  reloadMcpServers(): Promise<any>;

  /**
   * Get Bodhi config
   */
  getBodhiConfig(): Promise<any>;

  /**
   * Set Bodhi config
   */
  setBodhiConfig(config: any): Promise<any>;

  /**
   * Generic invoke method for custom commands
   */
  invoke<T = any>(command: string, args?: Record<string, any>): Promise<T>;
}
