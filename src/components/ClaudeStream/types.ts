export type ClaudeContentPart =
  | { type: "text"; text?: any }
  | {
      type: "tool_use"
      id?: string
      name?: string
      input?: any
    }
  | {
      type: "tool_result"
      tool_use_id?: string
      content?: any
      is_error?: boolean
    }
  | { type: string; [key: string]: any }

export type ClaudeMessage = {
  id?: string
  role?: string
  model?: string
  content?: ClaudeContentPart[] | string
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  [key: string]: any
}

export type ClaudeStreamMessage = {
  type: "system" | "assistant" | "user" | "result" | string
  subtype?: string
  session_id?: string
  sessionId?: string
  timestamp?: string
  cwd?: string
  message?: ClaudeMessage
  usage?: {
    input_tokens?: number
    output_tokens?: number
  }
  error?: any
  [key: string]: any
}
