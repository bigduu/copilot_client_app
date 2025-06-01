export interface ToolInfo {
  name: string;
  description: string;
  enabled: boolean;
  required_approval: boolean;
}

export interface ToolParameter {
  name: string;
  description: string;
  required: boolean;
  value: string;
}

export interface ToolExecutionRequest {
  tool_name: string;
  parameters: Record<string, string>;
}

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
}