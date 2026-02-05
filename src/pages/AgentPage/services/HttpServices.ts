import { UtilityService } from "./types";

import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";

export class HttpUtilityService implements Partial<UtilityService> {
  async getBodhiConfig(): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/bodhi/config"));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch Bodhi config:", error);
      return {};
    }
  }

  async setBodhiConfig(config: any): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/bodhi/config"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(config),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to set Bodhi config:", error);
      throw error;
    }
  }
}
