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
  enabled_by_default: boolean;
  version: string;
  created_at: string;
  updated_at: string;
}

export interface SkillFilter {
  category?: string;
  tags?: string[];
  search?: string;
  visibility?: SkillVisibility;
  enabled_only?: boolean;
}

export interface SkillListResponse {
  skills: SkillDefinition[];
  total: number;
}
