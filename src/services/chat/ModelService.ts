import { buildBackendUrl } from "../../shared/utils/backendBaseUrl";

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
      const response = await fetch(buildBackendUrl("/models"));
      if (!response.ok) {
        let errorCode: string | null = null;
        let errorMessage = `HTTP error! status: ${response.status}`;

        try {
          const payload = await response.json();
          const payloadError = payload?.error;
          if (payloadError && typeof payloadError === "object") {
            if (typeof payloadError.code === "string") {
              errorCode = payloadError.code;
            }
            if (typeof payloadError.message === "string") {
              errorMessage = payloadError.message;
            }
          }
        } catch {
          // Ignore JSON parse errors and use the fallback status-based message.
        }

        if (errorCode === "proxy_auth_required" || response.status === 428) {
          throw new ProxyAuthRequiredError(errorMessage);
        }

        throw new Error(errorMessage);
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
