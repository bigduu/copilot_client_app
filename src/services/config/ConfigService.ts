import { invoke } from "@tauri-apps/api/core";

export interface BambooConfig {
  model?: string;
  api_key?: string;
  api_base?: string;
  http_proxy?: string;
  https_proxy?: string;
  headless_auth?: boolean;
  [key: string]: unknown;
}

export interface SetupStatus {
  is_complete: boolean;
  has_proxy_config: boolean;
  has_proxy_env: boolean;
  message: string;
}

export class ConfigService {
  private static instance: ConfigService;
  private cachedConfig: BambooConfig | null = null;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * Get the full bamboo config from config.json
   */
  async getConfig(): Promise<BambooConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    try {
      const config = await invoke<BambooConfig>("get_bamboo_config");
      this.cachedConfig = config;
      return config;
    } catch (error) {
      console.error("Failed to load bamboo config:", error);
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
   * Get the setup status
   */
  async getSetupStatus(): Promise<SetupStatus> {
    try {
      const status = await invoke<SetupStatus>("get_setup_status");
      return status;
    } catch (error) {
      console.error("Failed to get setup status:", error);
      return {
        is_complete: false,
        has_proxy_config: false,
        has_proxy_env: false,
        message: "Failed to check setup status",
      };
    }
  }

  /**
   * Clear the cached config (call when config might have changed)
   */
  clearCache(): void {
    this.cachedConfig = null;
  }
}

export const configService = ConfigService.getInstance();
