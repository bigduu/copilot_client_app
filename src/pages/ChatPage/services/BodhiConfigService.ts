import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";

export interface BodhiSystemPrompt {
  id: string;
  name?: string;
  content?: string;
  description?: string;
}

export interface BodhiSystemPromptsResponse {
  prompts: BodhiSystemPrompt[];
}

export interface BodhiToolsResponse {
  tools: any[];
}

export class BodhiConfigService {
  private static instance: BodhiConfigService;

  private constructor() {}

  static getInstance(): BodhiConfigService {
    if (!BodhiConfigService.instance) {
      BodhiConfigService.instance = new BodhiConfigService();
    }
    return BodhiConfigService.instance;
  }

  async getSystemPrompts(): Promise<BodhiSystemPromptsResponse> {
    return {
      prompts: [],
    };
  }

  async getTools(): Promise<BodhiToolsResponse> {
    try {
      const response = await fetch(buildBackendUrl("/mcp/tools"));
      if (!response.ok) {
        throw new Error(`Failed to fetch MCP tools: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch MCP tools:", error);
      return { tools: [] };
    }
  }
}
