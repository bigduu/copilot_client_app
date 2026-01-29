import { ClaudeProject, ClaudeSession } from "./claudeCodeTypes";

export interface ClaudeSettings {
  data: Record<string, any>;
}

export interface SystemPromptResponse {
  content: string;
  path: string;
}

export type { ClaudeProject, ClaudeSession };
