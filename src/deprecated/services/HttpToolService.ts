import { buildBackendUrl } from "../../shared/utils/backendBaseUrl";

export class HttpToolService {
  async getAvailableTools(): Promise<any[]> {
    console.warn(
      "getAvailableTools() called but tools are no longer available to frontend",
    );
    return [];
  }

  async getToolsDocumentation(): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/tools/documentation"));
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
      const url = new URL(buildBackendUrl("/tools/ui"));
      if (categoryId) {
        url.searchParams.append("category_id", categoryId);
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Failed to fetch tools for UI:", error);
      return [];
    }
  }

  async executeTool(toolName: string, parameters: any[]): Promise<any> {
    try {
      const response = await fetch(buildBackendUrl("/tools/execute"), {
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
          `HTTP error! status: ${response.status}, body: ${errorText}`,
        );
      }

      const data = await response.json();
      const result = JSON.parse(data.result);
      return result;
    } catch (error) {
      console.error(`Failed to execute tool "${toolName}":`, error);
      throw error;
    }
  }

  async getToolCategories(): Promise<any[]> {
    try {
      const response = await fetch(buildBackendUrl("/tools/categories"));
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
        buildBackendUrl(`/tools/category/${categoryId}/tools`),
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
        buildBackendUrl(`/tools/category/${categoryId}/info`),
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
        buildBackendUrl(`/tools/category/${categoryId}/system_prompt`),
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data || "";
    } catch (error) {
      console.error(
        `Failed to fetch system prompt for category ${categoryId}:`,
        error,
      );
      return "";
    }
  }
}
