/**
 * Skill system types
 */

export type SkillVisibility = "public" | "private";

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  prompt: string;
  tool_refs: string[];
  workflow_refs: string[];
  visibility: SkillVisibility;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface SkillFilter {
  category?: string;
  tags?: string[];
  search?: string;
  visibility?: SkillVisibility;
}

export interface SkillListResponse {
  skills: SkillDefinition[];
  total: number;
}
