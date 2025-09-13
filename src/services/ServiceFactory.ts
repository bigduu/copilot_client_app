import { ToolService, UtilityService, ServiceMode } from './types';
import { AIService } from './AIService';
import { TauriChatService, TauriToolService, TauriUtilityService } from './TauriService';

const SERVICE_MODE_KEY = 'copilot_service_mode';

export class ServiceFactory {
  private static instance: ServiceFactory;
  private currentMode: ServiceMode = 'openai';
  
  // Service instances
  private tauriChatService = new TauriChatService();
  private tauriToolService = new TauriToolService();
  private tauriUtilityService = new TauriUtilityService();
  private openaiService = new AIService();

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

  getChatService(): AIService | TauriChatService {
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
    onChunk?: (chunk: string) => void,
    abortSignal?: AbortSignal
  ): Promise<void> {
    // If no model is provided, fall back to globally selected model from useModels
    // We intentionally avoid importing the hook here to prevent hook misuse.
    // Instead, we read the same localStorage key managed by useModels.
    let finalModel = (typeof model === 'string' && model.trim().length > 0) ? model : undefined;

    if (!finalModel) {
      try {
        const SELECTED_MODEL_LS_KEY = 'copilot_selected_model_id';
        const storedModel = localStorage.getItem(SELECTED_MODEL_LS_KEY);
        if (storedModel && storedModel.trim().length > 0) {
          finalModel = storedModel;
          console.log('[ServiceFactory] Using stored model from localStorage:', finalModel);
        }

        // If still not available, fetch models and pick the first one
        if (!finalModel) {
          console.log('[ServiceFactory] No stored model found, fetching available models...');
          const availableModels = await this.getModels().catch((error) => {
            console.error('[ServiceFactory] Failed to fetch models:', error);
            return [] as string[];
          });

          if (Array.isArray(availableModels) && availableModels.length > 0) {
            finalModel = availableModels[0];
            console.log('[ServiceFactory] Using first available model:', finalModel);
            try {
              localStorage.setItem(SELECTED_MODEL_LS_KEY, finalModel);
            } catch (error) {
              console.warn('[ServiceFactory] Failed to save model to localStorage:', error);
            }
          } else {
            console.warn('[ServiceFactory] No models available from service');
          }
        }
      } catch (error) {
        console.error('[ServiceFactory] Error in model fallback logic:', error);
      }
    } else {
      console.log('[ServiceFactory] Using provided model:', finalModel);
    }

    if (!finalModel) {
      console.warn('[ServiceFactory] No model available, proceeding with undefined (backend should handle this)');
    }

    return this.getChatService().executePrompt(messages, finalModel, onChunk, abortSignal);
  }

  async getModels(): Promise<string[]> {
    return this.getChatService().getModels();
  }

  async getCompletion(
    modelId: string,
    messages: any[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    abortSignal: AbortSignal
  ): Promise<void> {
    // Simplified for now, assuming the main chat service handles system prompt
    const allMessages = [{ role: 'system', content: systemPrompt }, ...messages];
    return this.executePrompt(allMessages, modelId, onChunk, abortSignal);
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
