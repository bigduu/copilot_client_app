/**
 * Skill Service
 *
 * Manages skills and skill-related operations.
 * Uses unified ApiClient for HTTP requests.
 */
import { apiClient } from "../api";
import type {
  SkillDefinition,
  SkillListResponse,
  SkillFilter,
} from "./types";

/**
 * Service for managing skills
 */
export class SkillService {
  /**
   * List all skills with optional filtering
   */
  async listSkills(filter?: SkillFilter): Promise<SkillListResponse> {
    const params = new URLSearchParams();
    if (filter?.category) params.append("category", filter.category);
    if (filter?.search) params.append("search", filter.search);
    if (filter?.enabled_only) params.append("enabled_only", "true");

    const queryString = params.toString();
    const path = queryString ? `skills?${queryString}` : "skills";
    return apiClient.get<SkillListResponse>(path);
  }

  /**
   * Get a single skill by ID
   */
  async getSkill(id: string): Promise<SkillDefinition> {
    return apiClient.get<SkillDefinition>(`skills/${id}`);
  }

  /**
   * Get tools filtered by enabled skills
   */
  async getFilteredTools(chatId?: string): Promise<unknown[]> {
    const params = chatId ? `?chat_id=${encodeURIComponent(chatId)}` : "";
    const data = await apiClient.get<{ tools?: unknown[] }>(`skills/filtered-tools${params}`);
    return data.tools ?? [];
  }

  /**
   * Enable a skill
   */
  async enableSkill(id: string): Promise<void> {
    await apiClient.post(`skills/${id}/enable`);
  }

  /**
   * Disable a skill
   */
  async disableSkill(id: string): Promise<void> {
    await apiClient.post(`skills/${id}/disable`);
  }
}

// Export singleton instance
export const skillService = new SkillService();
