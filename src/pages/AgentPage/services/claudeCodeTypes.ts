export interface ClaudeProject {
  id: string;
  path: string;
  sessions: string[];
  created_at: number;
  most_recent_session: number | null;
}

export interface ClaudeSession {
  id: string;
  project_id: string;
  project_path: string;
  todo_data?: any;
  created_at: number;
  first_message: string | null;
  message_timestamp: string | null;
}

export interface ClaudeMdFile {
  id?: string;
  name?: string | null;
  absolute_path: string;
  relative_path: string;
  size: number;
  modified: number;
}

export interface ClaudeEnvVar {
  key: string;
  value: string;
}

export interface ClaudeExecuteParams {
  projectPath: string;
  prompt: string;
  model: string;
}

export interface ClaudeResumeParams {
  projectPath: string;
  sessionId: string;
  prompt: string;
  model: string;
}
