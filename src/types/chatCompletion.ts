export interface ChatCompletionResponse {
  choices: Choice[];
  created?: number;
  id?: string;
  usage?: Usage;
  model?: string;
  system_fingerprint?: string;
}

export interface Choice {
  finish_reason: string;
  index?: number;
  delta?: { content?: string };
  message?: { role: "assistant"; content: string | null; tool_calls?: any[] };
}

export interface Usage {
  completion_tokens: number;
  prompt_tokens: number;
  total_tokens: number;
}

export interface UserSystemPrompt {
  id: string;
  name: string;
  description?: string;
  content: string;
  isDefault?: boolean;
}
