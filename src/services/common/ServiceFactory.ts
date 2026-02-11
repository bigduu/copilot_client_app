import { invoke } from "@tauri-apps/api/core";
import { apiClient } from "../api";

export interface UtilityService {
  /**
   * Copy text to clipboard
   */
  copyToClipboard(text: string): Promise<void>;

  /**
   * Get Bamboo config
   */
  getBambooConfig(): Promise<any>;

  /**
   * Set Bamboo config
   */
  setBambooConfig(config: any): Promise<any>;

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
   * Reset Bamboo config (delete config.json)
   */
  resetBambooConfig(): Promise<any>;

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
  async getBambooConfig(): Promise<any> {
    try {
      return await apiClient.get("bamboo/config");
    } catch (error) {
      console.error("Failed to fetch Bamboo config:", error);
      return {};
    }
  }

  async setBambooConfig(config: any): Promise<any> {
    return apiClient.post("bamboo/config", config);
  }

  async setProxyAuth(auth: { username: string; password: string }): Promise<any> {
    return apiClient.post("bamboo/proxy-auth", auth);
  }

  async getAnthropicModelMapping(): Promise<any> {
    try {
      return await apiClient.get("bamboo/anthropic-model-mapping");
    } catch (error) {
      console.error("Failed to fetch Anthropic model mapping:", error);
      return { mappings: {} };
    }
  }

  async setAnthropicModelMapping(mapping: any): Promise<any> {
    return apiClient.post("bamboo/anthropic-model-mapping", mapping);
  }

  async resetBambooConfig(): Promise<any> {
    return apiClient.post("bamboo/config/reset", {});
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
      getBambooConfig: () => this.httpUtilityService.getBambooConfig(),
      setBambooConfig: (config: any) =>
        this.httpUtilityService.setBambooConfig(config),
      setProxyAuth: (auth: { username: string; password: string }) =>
        this.httpUtilityService.setProxyAuth(auth),
      getAnthropicModelMapping: () => this.httpUtilityService.getAnthropicModelMapping(),
      setAnthropicModelMapping: (mapping: any) => this.httpUtilityService.setAnthropicModelMapping(mapping),
      resetBambooConfig: () => this.httpUtilityService.resetBambooConfig(),
      resetSetupStatus: () => this.tauriUtilityService.resetSetupStatus(),
    };
  }

  // Convenience methods for direct access
  async copyToClipboard(text: string): Promise<void> {
    return this.getUtilityService().copyToClipboard(text);
  }

  async getBambooConfig(): Promise<any> {
    return this.getUtilityService().getBambooConfig();
  }

  async setBambooConfig(config: any): Promise<any> {
    return this.getUtilityService().setBambooConfig(config);
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

  async resetBambooConfig(): Promise<any> {
    return this.getUtilityService().resetBambooConfig();
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
