import { invoke } from "@tauri-apps/api/core";
import { ToolExecutionResult } from "../types/chat";

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
  required_approval: boolean; // Add this field
  parameter_regex?: string;
  ai_prompt_template?: string; // Renamed to match backend
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

  constructor() {}

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

  // Note: getAvailableTools removed - tools are no longer exposed to frontend UI
  // Tools are now injected into system prompts for LLM-driven autonomous usage

  // Note: parseParametersWithAI removed - tool parameter parsing is now handled by backend
  // This method was used for AI-based parameter extraction, but is no longer needed
  // since tools are called autonomously by LLM with structured JSON format

  /**
   * Execute tool
   */
  async executeTool(
    request: ToolExecutionRequest,
  ): Promise<ToolExecutionResult> {
    console.log(
      "[ToolService] executeTool: Attempting to execute tool via Tauri with request:",
      request,
    );
    try {
      // The backend now returns a JSON string containing the result and display preference.
      const jsonResult = await invoke<string>("execute_tool", { request });
      console.log(
        '[ToolService] executeTool: Tauri command "execute_tool" returned successfully with JSON result:',
        jsonResult,
      );

      // Parse the JSON string into a structured object.
      const structuredResult: ToolExecutionResult = JSON.parse(jsonResult);
      console.log(
        "[ToolService] executeTool: Parsed structured result:",
        structuredResult,
      );

      return structuredResult;
    } catch (error) {
      console.error(
        '[ToolService] executeTool: Tauri command "execute_tool" invocation failed:',
        error,
      );
      throw new Error(`Workflow execution failed: ${error}`);
    }
  }

  // Note: The following methods removed - tools are no longer exposed to frontend:
  // - toolExists() - Tool existence checking no longer needed
  // - getToolInfo() - Tool information no longer accessible from frontend
  // - toolRequiresApproval() - Approval checking handled by backend agent loop
  // - getAllToolsForPrompt() - Tool injection now handled by backend SystemPromptEnhancer
  //
  // These methods were used when frontend needed to know about available tools,
  // but according to refactor-tools-to-llm-agent-mode design, tools are now:
  // 1. Injected into system prompts by backend
  // 2. Called autonomously by LLM via JSON format
  // 3. Approved and executed in backend agent loops
}
