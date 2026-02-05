export interface UtilityService {
  /**
   * Copy text to clipboard
   */
  copyToClipboard(text: string): Promise<void>;

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
