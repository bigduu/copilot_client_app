import { invoke } from "@tauri-apps/api/core";
import { apiClient } from "../api";

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
   * Set proxy auth credentials
   */
  setProxyAuth(auth: { username: string; password: string }): Promise<any>;

  /**
   * Get Anthropic model mapping
   */
  getAnthropicModelMapping(): Promise<any>;

  /**
   * Set Anthropic model mapping
   */
  setAnthropicModelMapping(mapping: any): Promise<any>;

  /**
   * Reset Bodhi config (delete config.json)
   */
  resetBodhiConfig(): Promise<any>;

  /**
   * Reset setup status (mark as incomplete)
   */
  resetSetupStatus(): Promise<void>;

  /**
   * Generic invoke method for custom commands
   */
  invoke<T = any>(command: string, args?: Record<string, any>): Promise<T>;
}

class HttpUtilityService implements Partial<UtilityService> {
  async getBodhiConfig(): Promise<any> {
    try {
      return await apiClient.get("bodhi/config");
    } catch (error) {
      console.error("Failed to fetch Bodhi config:", error);
      return {};
    }
  }

  async setBodhiConfig(config: any): Promise<any> {
    return apiClient.post("bodhi/config", config);
  }

  async setProxyAuth(auth: { username: string; password: string }): Promise<any> {
    return apiClient.post("bodhi/proxy-auth", auth);
  }

  async getAnthropicModelMapping(): Promise<any> {
    try {
      return await apiClient.get("bodhi/anthropic-model-mapping");
    } catch (error) {
      console.error("Failed to fetch Anthropic model mapping:", error);
      return { mappings: {} };
    }
  }

  async setAnthropicModelMapping(mapping: any): Promise<any> {
    return apiClient.post("bodhi/anthropic-model-mapping", mapping);
  }

  async resetBodhiConfig(): Promise<any> {
    return apiClient.post("bodhi/config/reset", {});
  }
}

class TauriUtilityService {
  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await invoke("copy_to_clipboard", { text });
  }

  /**
   * Reset setup status (mark as incomplete)
   */
  async resetSetupStatus(): Promise<void> {
    await invoke("mark_setup_incomplete");
  }

  /**
   * Generic invoke method for custom commands
   */
  async invoke<T = any>(
    command: string,
    args?: Record<string, any>,
  ): Promise<T> {
    return await invoke(command, args);
  }
}

/**
 * ServiceFactory - Simplified to use only Web/HTTP mode
 * All services now use HTTP API calls to the backend
 */
export class ServiceFactory {
  private static instance: ServiceFactory;

  // Service instances
  private tauriUtilityService = new TauriUtilityService();
  private httpUtilityService = new HttpUtilityService();

  private constructor() {
    // No mode switching needed - always use Web/HTTP mode
  }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  getUtilityService(): UtilityService {
    // Composite service:
    // - Native functions (copyToClipboard, invoke) use Tauri
    return {
      copyToClipboard: (text: string) =>
        this.tauriUtilityService.copyToClipboard(text),
      invoke: <T = any>(
        command: string,
        args?: Record<string, any>,
      ): Promise<T> => this.tauriUtilityService.invoke(command, args),
      getBodhiConfig: () => this.httpUtilityService.getBodhiConfig(),
      setBodhiConfig: (config: any) =>
        this.httpUtilityService.setBodhiConfig(config),
      setProxyAuth: (auth: { username: string; password: string }) =>
        this.httpUtilityService.setProxyAuth(auth),
      getAnthropicModelMapping: () => this.httpUtilityService.getAnthropicModelMapping(),
      setAnthropicModelMapping: (mapping: any) => this.httpUtilityService.setAnthropicModelMapping(mapping),
      resetBodhiConfig: () => this.httpUtilityService.resetBodhiConfig(),
      resetSetupStatus: () => this.tauriUtilityService.resetSetupStatus(),
    };
  }

  // Convenience methods for direct access
  async copyToClipboard(text: string): Promise<void> {
    return this.getUtilityService().copyToClipboard(text);
  }

  async getBodhiConfig(): Promise<any> {
    return this.getUtilityService().getBodhiConfig();
  }

  async setBodhiConfig(config: any): Promise<any> {
    return this.getUtilityService().setBodhiConfig(config);
  }

  async setProxyAuth(auth: { username: string; password: string }): Promise<any> {
    return this.getUtilityService().setProxyAuth(auth);
  }

  async getAnthropicModelMapping(): Promise<any> {
    return this.getUtilityService().getAnthropicModelMapping();
  }

  async setAnthropicModelMapping(mapping: any): Promise<any> {
    return this.getUtilityService().setAnthropicModelMapping(mapping);
  }

  async resetBodhiConfig(): Promise<any> {
    return this.getUtilityService().resetBodhiConfig();
  }

  async resetSetupStatus(): Promise<void> {
    return this.getUtilityService().resetSetupStatus();
  }

  async invoke<T = any>(
    command: string,
    args?: Record<string, any>,
  ): Promise<T> {
    return this.getUtilityService().invoke(command, args);
  }
}

// Export singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
