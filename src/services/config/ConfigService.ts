import { invoke } from "@tauri-apps/api/core";

export interface BodhiConfig {
  model?: string;
  api_key?: string;
  api_base?: string;
  http_proxy?: string;
  https_proxy?: string;
  headless_auth?: boolean;
  [key: string]: unknown;
}

export class ConfigService {
  private static instance: ConfigService;
  private cachedConfig: BodhiConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Get the full bodhi config from config.json
   */
  async getConfig(): Promise<BodhiConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const config = await invoke<BodhiConfig>("get_bodhi_config");
      this.cachedConfig = config;
      return config;
    } catch (error) {
      console.error("Failed to load bodhi config:", error);
      return {};
    }
  }

  /**
   * Get the model from config.json
   */
  async getModel(): Promise<string | undefined> {
    const config = await this.getConfig();
    return config.model;
  }

  /**
   * Clear the cached config (call when config might have changed)
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

export const configService = ConfigService.getInstance();
