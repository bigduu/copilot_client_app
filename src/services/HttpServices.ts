import { ToolService, UtilityService } from "./types";

const API_BASE_URL = "http://127.0.0.1:8080/v1";

export class HttpToolService implements ToolService {
  async getAvailableTools(): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tools/available`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // The backend currently returns a string, which isn't ideal.
      // We'll parse it for now, but this should be changed to JSON.
      const text = await response.text();
      console.log("Available tools response:", text);
      // This is a temporary parsing logic.
      return text.replace("Available tools: ", "").split(", ");
    } catch (error) {
      console.error("Failed to fetch available tools:", error);
      return [];
    }
  }

  async getToolsDocumentation(): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/tools/documentation`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error("Failed to fetch tools documentation:", error);
      return "";
    }
  }

  async getToolsForUI(categoryId?: string): Promise<any[]> {
    try {
      const url = new URL(`${API_BASE_URL}/tools/ui`);
      if (categoryId) {
        url.searchParams.append("category_id", categoryId);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data; // Assuming the backend returns the correct structure
    } catch (error) {
      console.error("Failed to fetch tools for UI:", error);
      return [];
    }
  }

  async executeTool(toolName: string, parameters: any[]): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/tools/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tool_name: toolName,
          parameters,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, body: ${errorText}`
        );
      }

      const data = await response.json();
      // The backend returns a JSON string inside the result field.
      // This is consistent with the old Tauri command, but ideally should be refactored.
      const result = JSON.parse(data.result);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool "${toolName}":`, error);
      throw error;
    }
  }

  async getToolCategories(): Promise<any[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tools/categories`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch tool categories:", error);
      return [];
    }
  }

  async getCategoryTools(categoryId: string): Promise<any[]> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/tools/category/${categoryId}/tools`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch tools for category ${categoryId}:`, error);
      return [];
    }
  }

  async getToolCategoryInfo(categoryId: string): Promise<any> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/tools/category/${categoryId}/info`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch info for category ${categoryId}:`, error);
      return null;
    }
  }

  async getCategorySystemPrompt(categoryId: string): Promise<string> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/tools/category/${categoryId}/system_prompt`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // The backend returns JSON which might be null, or a string.
      const data = await response.json();
      return data || "";
    } catch (error) {
      console.error(
        `Failed to fetch system prompt for category ${categoryId}:`,
        error
      );
      return "";
    }
  }
}

export class HttpUtilityService implements Partial<UtilityService> {
  async getMcpServers(): Promise<any> {
    try {
      const response = await fetch(`${API_BASE_URL}/mcp/servers`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Failed to fetch MCP servers:", error);
      return { servers: [] };
    }
  }

  async setMcpServers(servers: any): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/mcp/servers`, {
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
      const response = await fetch(`${API_BASE_URL}/mcp/status/${name}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to fetch MCP client status for ${name}:`, error);
      return null;
    }
  }
}
