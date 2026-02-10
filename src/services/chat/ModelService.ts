import { apiClient, ApiError } from "../api";

export class ProxyAuthRequiredError extends Error {
  readonly code = "proxy_auth_required";

  constructor(message = "Proxy authentication required") {
    super(message);
    this.name = "ProxyAuthRequiredError";
  }
}

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
      const data = await apiClient.get<{ data: Array<{ id: string }> }>("models");
      return data.data.map((model) => model.id);
    } catch (error) {
      console.error("Failed to fetch models from HTTP API:", error);

      // Handle proxy auth error
      if (error instanceof ApiError) {
        if (error.status === 428) {
          throw new ProxyAuthRequiredError(error.message);
        }

        // Try to parse error code from body
        try {
          const body = JSON.parse(error.body || "{}");
          if (body.error?.code === "proxy_auth_required") {
            throw new ProxyAuthRequiredError(body.error.message || error.message);
          }
        } catch {
          // Ignore parse errors
        }
      }

      throw error;
    }
  }
}

export const modelService = ModelService.getInstance();
