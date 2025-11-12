import { ToolService, UtilityService } from "./types";
import { HttpToolService, HttpUtilityService } from "./HttpServices";
import { TauriChatService, TauriUtilityService } from "./TauriService";

/**
 * ServiceFactory - Simplified to use only Web/HTTP mode
 * All services now use HTTP API calls to the backend
 */
export class ServiceFactory {
  private static instance: ServiceFactory;

  // Service instances
  private tauriChatService = new TauriChatService();
  private tauriUtilityService = new TauriUtilityService();
  private httpToolService = new HttpToolService();
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

  getChatService(): TauriChatService {
    // Always return Tauri chat service (used for all chat operations)
    return this.tauriChatService;
  }

  getToolService(): ToolService {
    // Always return HTTP-based tool service
    return this.httpToolService;
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
    };
  }

  // Convenience methods for direct access
  async executePrompt(
    messages: any[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    return this.getChatService().executePrompt(
      messages,
      model,
      onChunk,
      abortSignal
    );
  }

  async getModels(): Promise<string[]> {
    return this.getChatService().getModels();
  }

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

  async invoke<T = any>(
    command: string,
    args?: Record<string, any>
  ): Promise<T> {
    return this.getUtilityService().invoke(command, args);
  }
}

// Export singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
