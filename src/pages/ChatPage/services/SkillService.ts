import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";
import type {
  SkillDefinition,
  CreateSkillRequest,
  UpdateSkillRequest,
  EnableSkillRequest,
  SkillListResponse,
  SkillEnablementResponse,
  AvailableToolsResponse,
  AvailableWorkflowsResponse,
  SkillFilter,
} from "../types/skill";

/**
 * Service for managing skills
 */
export class SkillService {
  private static instance: SkillService;

  private constructor() {}

  static getInstance(): SkillService {
    if (!SkillService.instance) {
      SkillService.instance = new SkillService();
    }
    return SkillService.instance;
  }

  /**
   * List all skills with optional filtering
   */
  async listSkills(filter?: SkillFilter): Promise<SkillListResponse> {
    const params = new URLSearchParams();
    if (filter?.category) params.append("category", filter.category);
    if (filter?.search) params.append("search", filter.search);
    if (filter?.enabled_only) params.append("enabled_only", "true");

    const response = await fetch(buildBackendUrl(`/v1/skills?${params.toString()}`));
    if (!response.ok) {
      throw new Error(`Failed to list skills: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get a single skill by ID
   */
  async getSkill(id: string): Promise<SkillDefinition> {
    const response = await fetch(buildBackendUrl(`/v1/skills/${id}`));
    if (!response.ok) {
      throw new Error(`Failed to get skill: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Create a new skill
   */
  async createSkill(request: CreateSkillRequest): Promise<SkillDefinition> {
    const response = await fetch(buildBackendUrl("/v1/skills"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to create skill: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Update an existing skill
   */
  async updateSkill(id: string, request: UpdateSkillRequest): Promise<SkillDefinition> {
    const response = await fetch(buildBackendUrl(`/v1/skills/${id}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to update skill: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Delete a skill
   */
  async deleteSkill(id: string): Promise<void> {
    const response = await fetch(buildBackendUrl(`/v1/skills/${id}`), {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete skill: ${response.statusText}`);
    }
  }

  /**
   * Enable a skill (globally or for a specific chat)
   */
  async enableSkill(id: string, chatId?: string): Promise<SkillEnablementResponse> {
    const request: EnableSkillRequest = chatId ? { chat_id: chatId } : {};
    const response = await fetch(buildBackendUrl(`/v1/skills/${id}/enable`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to enable skill: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Disable a skill (globally or for a specific chat)
   */
  async disableSkill(id: string, chatId?: string): Promise<SkillEnablementResponse> {
    const request: EnableSkillRequest = chatId ? { chat_id: chatId } : {};
    const response = await fetch(buildBackendUrl(`/v1/skills/${id}/disable`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      throw new Error(`Failed to disable skill: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Get available MCP tools for skill creation
   */
  async getAvailableTools(): Promise<string[]> {
    const response = await fetch(buildBackendUrl("/v1/skills/available-tools"));
    if (!response.ok) {
      throw new Error(`Failed to get available tools: ${response.statusText}`);
    }
    const data: AvailableToolsResponse = await response.json();
    return data.tools;
  }

  /**
   * Get tools filtered by enabled skills
   */
  async getFilteredTools(chatId?: string): Promise<string[]> {
    const params = chatId ? `?chat_id=${encodeURIComponent(chatId)}` : "";
    const response = await fetch(buildBackendUrl(`/v1/skills/filtered-tools${params}`));
    if (!response.ok) {
      throw new Error(`Failed to get filtered tools: ${response.statusText}`);
    }
    const data: AvailableToolsResponse = await response.json();
    return data.tools;
  }

  /**
   * Get available workflows for skill creation
   */
  async getAvailableWorkflows(): Promise<string[]> {
    const response = await fetch(buildBackendUrl("/v1/skills/available-workflows"));
    if (!response.ok) {
      throw new Error(`Failed to get available workflows: ${response.statusText}`);
    }
    const data: AvailableWorkflowsResponse = await response.json();
    return data.workflows;
  }
}

export const skillService = SkillService.getInstance();
