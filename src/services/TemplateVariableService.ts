/**
 * Template Variable Service
 * Manages template variables for system prompts
 */

const API_BASE_URL = "http://127.0.0.1:8080/v1";

export interface TemplateVariable {
  key: string;
  value: string;
  description?: string;
}

export class TemplateVariableService {
  private static instance: TemplateVariableService;

  private constructor() {}

  static getInstance(): TemplateVariableService {
    if (!TemplateVariableService.instance) {
      TemplateVariableService.instance = new TemplateVariableService();
    }
    return TemplateVariableService.instance;
  }

  /**
   * Get all template variables
   */
  async getAll(): Promise<Record<string, string>> {
    try {
      const response = await fetch(`${API_BASE_URL}/template-variables`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.variables || {};
    } catch (error) {
      console.error("Failed to get template variables:", error);
      throw error;
    }
  }

  /**
   * Get a specific template variable
   */
  async get(key: string): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/template-variables/${key}`);
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.value || null;
    } catch (error) {
      console.error(`Failed to get template variable ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set a template variable
   */
  async set(key: string, value: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/template-variables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key, value }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error(`Failed to set template variable ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set multiple template variables at once
   */
  async setMultiple(variables: Record<string, string>): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/template-variables`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ variables }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Failed to set template variables:", error);
      throw error;
    }
  }

  /**
   * Delete a template variable
   */
  async delete(key: string): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/template-variables/${key}`,
        {
          method: "DELETE",
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error(`Failed to delete template variable ${key}:`, error);
      throw error;
    }
  }

  /**
   * Reload template variables from storage
   */
  async reload(): Promise<void> {
    try {
      const response = await fetch(
        `${API_BASE_URL}/template-variables/reload`,
        {
          method: "POST",
        },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`,
        );
      }
    } catch (error) {
      console.error("Failed to reload template variables:", error);
      throw error;
    }
  }
}








