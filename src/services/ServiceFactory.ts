import { UtilityService } from "./types";
import { HttpUtilityService } from "./HttpServices";
import { TauriUtilityService } from "./TauriService";

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
    // - MCP functions use HTTP
    return {
      copyToClipboard: (text: string) =>
        this.tauriUtilityService.copyToClipboard(text),
      invoke: <T = any>(
        command: string,
        args?: Record<string, any>
      ): Promise<T> => this.tauriUtilityService.invoke(command, args),
      getMcpServers: () => this.httpUtilityService.getMcpServers(),
      setMcpServers: (servers: any) =>
        this.httpUtilityService.setMcpServers(servers),
      getMcpClientStatus: (name: string) =>
        this.httpUtilityService.getMcpClientStatus(name),
      reloadMcpServers: () => this.httpUtilityService.reloadMcpServers(),
      getBodhiConfig: () => this.httpUtilityService.getBodhiConfig(),
      setBodhiConfig: (config: any) =>
        this.httpUtilityService.setBodhiConfig(config),
    };
  }

  // Convenience methods for direct access
  async copyToClipboard(text: string): Promise<void> {
    return this.getUtilityService().copyToClipboard(text);
  }

  async getMcpServers(): Promise<any> {
    return this.getUtilityService().getMcpServers();
  }

  async setMcpServers(servers: any): Promise<void> {
    return this.getUtilityService().setMcpServers(servers);
  }

  async getMcpClientStatus(name: string): Promise<any> {
    return this.getUtilityService().getMcpClientStatus(name);
  }

  async reloadMcpServers(): Promise<any> {
    return this.getUtilityService().reloadMcpServers();
  }

  async getBodhiConfig(): Promise<any> {
    return this.getUtilityService().getBodhiConfig();
  }

  async setBodhiConfig(config: any): Promise<any> {
    return this.getUtilityService().setBodhiConfig(config);
  }

  async invoke<T = any>(
    command: string,
    args?: Record<string, any>
  ): Promise<T> {
    return this.getUtilityService().invoke(command, args);
  }
}

// Export singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
