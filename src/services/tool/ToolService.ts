/**
 * Tool Service
 *
 * Handles business logic for tool invocations.
 * Uses unified ApiClient for HTTP requests.
 */
import { apiClient, ApiError } from "../api";
import type { ToolExecutionResult } from "./types";

// Re-export type from types.ts for backward compatibility
export type { ToolExecutionResult, DisplayPreference } from "./types";

export interface ToolCallRequest {
  tool_name: string;
  user_description: string;
  parameter_parsing_strategy?:
    | "AIParameterParsing"
    | "RegexParameterExtraction";
}

export interface ParameterValue {
  name: string;
  value: string;
}

export interface ToolExecutionRequest {
  tool_name: string;
  parameters: ParameterValue[];
}

export interface ToolUIInfo {
  name: string;
  description: string;
  parameters: ParameterInfo[];
  tool_type: string;
  parameter_parsing_strategy?:
    | "AIParameterParsing"
    | "RegexParameterExtraction";
  required_approval: boolean;
  parameter_regex?: string;
  ai_prompt_template?: string;
  hide_in_selector: boolean;
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
  type: string;
}

export interface ToolsUIResponse {
  tools: ToolUIInfo[];
  is_strict_mode: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errorMessage?: string;
}

/**
 * ToolService handles business logic for tool invocations
 * Including tool call parsing, parameter processing, tool execution, etc.
 */
export class ToolService {
  private static instance: ToolService;

  static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  /**
   * Parses a user-entered command from the input box.
   * e.g., "/simple_tool 123" -> { tool_name: "simple_tool", user_description: "123" }
   */
  parseUserCommand(content: string): ToolCallRequest | null {
    console.log(
      `[ToolService] parseUserCommand: Parsing content: "${content}"`,
    );
    const trimmedContent = content.trim();
    if (!trimmedContent.startsWith("/")) {
      console.log(
        '[ToolService] parseUserCommand: Content does not start with "/", not a tool command.',
      );
      return null;
    }

    const spaceIndex = trimmedContent.indexOf(" ");
    let tool_name;
    let user_description;

    if (spaceIndex === -1) {
      // Command is just "/tool_name"
      tool_name = trimmedContent.substring(1);
      user_description = "";
    } else {
      // Command is "/tool_name with description"
      tool_name = trimmedContent.substring(1, spaceIndex);
      user_description = trimmedContent.substring(spaceIndex + 1).trim();
    }

    if (tool_name) {
      const result = { tool_name, user_description };
      console.log(
        "[ToolService] parseUserCommand: Successfully parsed command:",
        result,
      );
      return result;
    }

    console.log(
      "[ToolService] parseUserCommand: Failed to parse tool name from content.",
    );
    return null;
  }

  /**
   * Parses an AI-generated string to see if it's a tool call.
   * This is kept separate in case the AI format differs from user commands.
   */
  parseAIResponseToToolCall(content: string): ToolCallRequest | null {
    // For now, AI and user formats are the same.
    return this.parseUserCommand(content);
  }

  /**
   * Execute tool
   */
  async executeTool(
    request: ToolExecutionRequest,
  ): Promise<ToolExecutionResult> {
    console.log(
      "[ToolService] executeTool: Attempting to execute tool via HTTP with request:",
      request,
    );
    try {
      const data = await apiClient.post<{ result: string }>("tools/execute", request);
      const structuredResult: ToolExecutionResult = JSON.parse(data.result);
      console.log(
        "[ToolService] executeTool: Parsed structured result:",
        structuredResult,
      );

      return structuredResult;
    } catch (error) {
      console.error(
        "[ToolService] executeTool: HTTP tool execution failed:",
        error,
      );
      if (error instanceof ApiError) {
        throw new Error(`Workflow execution failed: ${error.message}`);
      }
      throw error;
    }
  }
}

// Export singleton instance
export const toolService = new ToolService();
