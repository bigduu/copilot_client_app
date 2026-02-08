/**
 * Tool Service Types
 */

export type DisplayPreference = "Default" | "Collapsible" | "Hidden";

export interface ToolExecutionResult {
  tool_name: string;
  result: string;
  display_preference: DisplayPreference;
}
