export interface BambooSystemPrompt {
  id: string;
  name?: string;
  content?: string;
  description?: string;
}

export interface BambooSystemPromptsResponse {
  prompts: BambooSystemPrompt[];
}

export class BambooConfigService {
  private static instance: BambooConfigService;

  private constructor() {}

  static getInstance(): BambooConfigService {
    if (!BambooConfigService.instance) {
      BambooConfigService.instance = new BambooConfigService();
    }
    return BambooConfigService.instance;
  }

  async getSystemPrompts(): Promise<BambooSystemPromptsResponse> {
    return {
      prompts: [],
    };
  }

  async getTools(): Promise<{ tools: any[] }> {
    return { tools: [] };
  }
}
