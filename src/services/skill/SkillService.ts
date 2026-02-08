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
   * @param filter - Optional filter criteria
   * @param refresh - If true, reload skills from disk before returning
   */
  async listSkills(filter?: SkillFilter, refresh?: boolean): Promise<SkillListResponse> {
    const params = new URLSearchParams();
    if (filter?.category) params.append("category", filter.category);
    if (filter?.search) params.append("search", filter.search);
    if (refresh) params.append("refresh", "true");

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
   * Get tools filtered by skills
   */
  async getFilteredTools(chatId?: string): Promise<unknown[]> {
    const params = chatId ? `?chat_id=${encodeURIComponent(chatId)}` : "";
    const data = await apiClient.get<{ tools?: unknown[] }>(`skills/filtered-tools${params}`);
    return data.tools ?? [];
  }
}

// Export singleton instance
export const skillService = new SkillService();
