import { ChatService, ToolService, UtilityService, ServiceMode } from './types';
import { OpenAIService } from './OpenAIService';
import { TauriChatService, TauriToolService, TauriUtilityService } from './TauriService';

const SERVICE_MODE_KEY = 'copilot_service_mode';

export class ServiceFactory {
  private static instance: ServiceFactory;
  private currentMode: ServiceMode = 'openai';
  
  // Service instances
  private tauriChatService = new TauriChatService();
  private tauriToolService = new TauriToolService();
  private tauriUtilityService = new TauriUtilityService();
  private openaiService = new OpenAIService();

  private constructor() {
    // Load saved mode from localStorage, default to 'openai' if not set
    const savedMode = localStorage.getItem(SERVICE_MODE_KEY) as ServiceMode;
    if (savedMode && (savedMode === 'tauri' || savedMode === 'openai')) {
      this.currentMode = savedMode;
    } else {
      // Set default mode to openai and save it
      this.currentMode = 'openai';
      localStorage.setItem(SERVICE_MODE_KEY, 'openai');
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

  getChatService(): ChatService {
    switch (this.currentMode) {
      case 'openai':
        return this.openaiService;
      case 'tauri':
      default:
        return this.tauriChatService;
    }
  }

  getToolService(): ToolService {
    // Tools are always handled by Tauri service since they're not part of OpenAI API
    return this.tauriToolService;
  }

  getUtilityService(): UtilityService {
    // Utilities are always handled by Tauri service
    return this.tauriUtilityService;
  }

  // Convenience methods for direct access
  async executePrompt(
    messages: any[],
    model?: string,
    onChunk?: (chunk: string) => void
  ): Promise<void> {
    return this.getChatService().executePrompt(messages, model, onChunk);
  }

  async getModels(): Promise<string[]> {
    return this.getChatService().getModels();
  }

  async copyToClipboard(text: string): Promise<void> {
    return this.getUtilityService().copyToClipboard(text);
  }

  async getAvailableTools(): Promise<any[]> {
    return this.getToolService().getAvailableTools();
  }

  async getToolsDocumentation(): Promise<any> {
    return this.getToolService().getToolsDocumentation();
  }

  async getToolsForUI(): Promise<any[]> {
    return this.getToolService().getToolsForUI();
  }

  async executeTool(toolName: string, parameters: any[]): Promise<any> {
    return this.getToolService().executeTool(toolName, parameters);
  }

  async getToolCategories(): Promise<any[]> {
    return this.getToolService().getToolCategories();
  }

  async getCategoryTools(categoryId: string): Promise<any[]> {
    return this.getToolService().getCategoryTools(categoryId);
  }

  async getToolCategoryInfo(categoryId: string): Promise<any> {
    return this.getToolService().getToolCategoryInfo(categoryId);
  }

  async getCategorySystemPrompt(categoryId: string): Promise<string> {
    return this.getToolService().getCategorySystemPrompt(categoryId);
  }

  async getMcpServers(): Promise<any> {
    return this.getUtilityService().getMcpServers();
  }

  async setMcpServers(servers: any): Promise<void> {
    return this.getUtilityService().setMcpServers(servers);
  }

  async getMcpClientStatus(): Promise<any> {
    return this.getUtilityService().getMcpClientStatus();
  }

  async invoke<T = any>(command: string, args?: Record<string, any>): Promise<T> {
    return this.getUtilityService().invoke(command, args);
  }
}

// Export singleton instance for easy access
export const serviceFactory = ServiceFactory.getInstance();
