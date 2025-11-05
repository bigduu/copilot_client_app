import { ToolService, UtilityService, ServiceMode } from "./types";
import { AIService } from "./AIService";
import { HttpToolService, HttpUtilityService } from "./HttpServices";
import { TauriChatService, TauriUtilityService } from "./TauriService";

const SERVICE_MODE_KEY = "copilot_service_mode";

export class ServiceFactory {
  private static instance: ServiceFactory;
  private currentMode: ServiceMode = "openai";

  // Service instances
  private tauriChatService = new TauriChatService();
  private tauriUtilityService = new TauriUtilityService();
  private openaiService = new AIService();
  private httpToolService = new HttpToolService();
  private httpUtilityService = new HttpUtilityService();

  private constructor() {
    // Load saved mode from localStorage, default to 'openai' if not set
    const savedMode = localStorage.getItem(SERVICE_MODE_KEY) as ServiceMode;
    if (savedMode && (savedMode === "tauri" || savedMode === "openai")) {
      this.currentMode = savedMode;
    } else {
      // Set default mode to openai and save it
      this.currentMode = "openai";
      localStorage.setItem(SERVICE_MODE_KEY, "openai");
    }
  }

  static getInstance(): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
    }
    return ServiceFactory.instance;
  }

  getCurrentMode(): ServiceMode {
    return this.currentMode;
  }

  setMode(mode: ServiceMode): void {
    this.currentMode = mode;
    localStorage.setItem(SERVICE_MODE_KEY, mode);
  }

  getChatService(): AIService | TauriChatService {
    switch (this.currentMode) {
      case "openai":
        return this.openaiService;
      case "tauri":
      default:
        return this.tauriChatService;
    }
  }

  getToolService(): ToolService {
    // Always return the HTTP-based tool service as the Tauri one is deprecated.
    return this.httpToolService;
  }

  getUtilityService(): UtilityService {
    // This is a composite service.
    // Native functions like copyToClipboard always use Tauri.
    // Other functions use HTTP when in openai mode.
    if (this.currentMode === "openai") {
      return {
        copyToClipboard: (text: string) =>
          this.tauriUtilityService.copyToClipboard(text),
        invoke: <T = any>(
          command: string,
          args?: Record<string, any>,
        ): Promise<T> => this.tauriUtilityService.invoke(command, args),
        getMcpServers: () => this.httpUtilityService.getMcpServers(),
        setMcpServers: (servers: any) =>
          this.httpUtilityService.setMcpServers(servers),
        getMcpClientStatus: (name: string) =>
          this.httpUtilityService.getMcpClientStatus(name),
      };
    }
    return this.tauriUtilityService;
  }

  // Convenience methods for direct access
  async executePrompt(
    messages: any[],
    model?: string,
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    return this.getChatService().executePrompt(
      messages,
      model,
      onChunk,
      abortSignal,
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
    args?: Record<string, any>,
  ): Promise<T> {
    return this.getUtilityService().invoke(command, args);
  }
}

// Export singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
