import { buildBackendUrl } from "../utils/backendBaseUrl";

export class ModelService {
  private static instance: ModelService;

  private constructor() {}

  static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService();
    }
    return ModelService.instance;
  }

  async getModels(): Promise<string[]> {
    try {
      const response = await fetch(buildBackendUrl("/models"));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.data.map((model: any) => model.id);
    } catch (error) {
      console.error("Failed to fetch models from HTTP API:", error);
      throw error;
    }
  }
}

export const modelService = ModelService.getInstance();
