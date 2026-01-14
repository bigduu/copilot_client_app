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
  private readonly baseUrl = "http://127.0.0.1:8080/v1/bodhi"

  private constructor() {}

  static getInstance(): BodhiConfigService {
    if (!BodhiConfigService.instance) {
      BodhiConfigService.instance = new BodhiConfigService()
    }
    return BodhiConfigService.instance
  }

  async getSystemPrompts(): Promise<BodhiSystemPromptsResponse> {
    const response = await fetch(`${this.baseUrl}/system-prompts`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      prompts: Array.isArray(data?.prompts) ? data.prompts : [],
    }
  }

  async getTools(): Promise<BodhiToolsResponse> {
    const response = await fetch(`${this.baseUrl}/tools`)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data = await response.json()
    return {
      tools: Array.isArray(data?.tools) ? data.tools : [],
    }
  }
}
