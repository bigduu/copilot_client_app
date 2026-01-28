// MCP server types for frontend, matching Rust backend

export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  autoApprove?: string[];
  disabled?: boolean;
  timeout?: number;
  transportType?: string;
}

export interface McpServersConfig {
  mcpServers: Record<string, McpServerConfig>;
}
