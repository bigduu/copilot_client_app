import { UtilityService } from "./types";

import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";

export class HttpUtilityService implements Partial<UtilityService> {
  async getMcpServers(): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/mcp/servers"));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch MCP servers:", error);
      return { mcpServers: {} };
    }
  }

  async setMcpServers(servers: any): Promise<void> {
    try {
      const response = await fetch(buildBackendUrl("/mcp/servers"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(servers),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Failed to set MCP servers:", error);
      throw error;
    }
  }

  async getMcpClientStatus(name: string): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl(`/mcp/status/${name}`));
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch MCP client status for ${name}:`, error);
      return null;
    }
  }

  async reloadMcpServers(): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/mcp/reload"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to reload MCP servers:", error);
      throw error;
    }
  }

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
