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

export interface SkillEnablement {
  enabled_skill_ids: string[];
  chat_overrides: Record<string, string[]>;
}

export interface SkillFilter {
  category?: string;
  tags?: string[];
  search?: string;
  visibility?: SkillVisibility;
  enabled_only?: boolean;
}

export interface CreateSkillRequest {
  id?: string;
  name: string;
  description: string;
  category: string;
  tags?: string[];
  prompt: string;
  tool_refs?: string[];
  workflow_refs?: string[];
  visibility?: SkillVisibility;
  enabled_by_default?: boolean;
}

export interface UpdateSkillRequest {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  prompt?: string;
  tool_refs?: string[];
  workflow_refs?: string[];
  visibility?: SkillVisibility;
  enabled_by_default?: boolean;
}

export interface EnableSkillRequest {
  chat_id?: string;
}

export interface SkillListResponse {
  skills: SkillDefinition[];
  total: number;
}

export interface SkillEnablementResponse {
  enabled_skill_ids: string[];
}

export interface AvailableToolsResponse {
  tools: string[];
}

export interface AvailableWorkflowsResponse {
  workflows: string[];
}
