import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";
import type {
  SkillDefinition,
  SkillListResponse,
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
   * Get tools filtered by enabled skills
   */
  async getFilteredTools(chatId?: string): Promise<any[]> {
    const params = chatId ? `?chat_id=${encodeURIComponent(chatId)}` : "";
    const response = await fetch(buildBackendUrl(`/v1/skills/filtered-tools${params}`));
    if (!response.ok) {
      throw new Error(`Failed to get filtered tools: ${response.statusText}`);
    }
    const data = await response.json();
    return data.tools ?? [];
  }
}

export const skillService = SkillService.getInstance();
