export interface BodhiSystemPrompt {
  id: string
  name?: string
  content?: string
  description?: string
}

export interface BodhiSystemPromptsResponse {
  prompts: BodhiSystemPrompt[]
}

export interface BodhiToolsResponse {
  tools: any[]
}

export class BodhiConfigService {
  private static instance: BodhiConfigService

  private constructor() {}

  static getInstance(): BodhiConfigService {
    if (!BodhiConfigService.instance) {
      BodhiConfigService.instance = new BodhiConfigService()
    }
    return BodhiConfigService.instance
  }

  async getSystemPrompts(): Promise<BodhiSystemPromptsResponse> {
    return {
      prompts: [],
    }
  }

  async getTools(): Promise<BodhiToolsResponse> {
    return {
      tools: [],
    }
  }
}
