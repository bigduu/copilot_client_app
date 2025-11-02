import { invoke } from "@tauri-apps/api/core";
import OpenAI from "openai";
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
      `[ToolService] parseUserCommand: Parsing content: "${content}"`
    );
    const trimmedContent = content.trim();
    if (!trimmedContent.startsWith("/")) {
      console.log(
        '[ToolService] parseUserCommand: Content does not start with "/", not a tool command.'
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
        result
      );
      return result;
    }

    console.log(
      "[ToolService] parseUserCommand: Failed to parse tool name from content."
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
   * Get available tools list
   */
  async getAvailableTools(): Promise<ToolUIInfo[]> {
    try {
      const response = await fetch("http://127.0.0.1:8080/v1/tools/available");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: ToolsUIResponse = await response.json();
      if (data && Array.isArray(data.tools)) {
        return data.tools;
      }
      return [];
    } catch (error) {
      console.error("Failed to get available tools:", error);
      throw new Error(`Failed to get available tools: ${error}`);
    }
  }

  /**
   * Parses tool parameters using an AI model.
   * This is a dedicated method to be called by the state machine.
   */
  async parseParametersWithAI(
    toolCall: ToolCallRequest
  ): Promise<ParameterValue[]> {
    console.log(
      `[ToolService] parseParametersWithAI: Starting AI parsing for tool "${toolCall.tool_name}"`
    );
    const toolInfo = await this.getToolInfo(toolCall.tool_name);
    if (!toolInfo) {
      throw new Error(
        `Tool "${toolCall.tool_name}" not found for AI parameter parsing.`
      );
    }

    if (!toolInfo.ai_prompt_template) {
      throw new Error(
        `Tool "${toolCall.tool_name}" is not configured for AI parameter parsing (missing prompt template).`
      );
    }

    // Use the prompt template from the backend, replacing the placeholder.
    const systemPrompt = toolInfo.ai_prompt_template.replace(
      "{user_description}",
      toolCall.user_description
    );

    const messages = [
      { role: "system", content: systemPrompt },
      // The user's raw input is still valuable context for the AI.
      { role: "user", content: toolCall.user_description },
    ];

    try {
      // Use the OpenAI client to call the local web server, same as AIService
      const client = new OpenAI({
        baseURL: "http://localhost:8080/v1",
        apiKey: "dummy-key",
        dangerouslyAllowBrowser: true,
      });

      const response = await client.chat.completions.create({
        model: "gpt-4.1", // Or a model configured for this task
        messages: messages as any,
        stream: false,
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error(
          "AI did not return a valid response for parameter parsing."
        );
      }

      console.log(
        `[ToolService] parseParametersWithAI: AI response: "${aiResponse}"`
      );

      // The AI's response IS the parameter value.
      if (toolInfo.parameters.length === 1) {
        const parsedParams: ParameterValue[] = [
          {
            name: toolInfo.parameters[0].name,
            value: aiResponse.trim(),
          },
        ];
        console.log(
          "[ToolService] parseParametersWithAI: Parsed parameters:",
          parsedParams
        );
        return parsedParams;
      }

      console.warn(
        `[ToolService] AI parameter parsing for multi-parameter tools is not fully implemented. Using fallback.`
      );
      return [{ name: "parameters", value: aiResponse.trim() }];
    } catch (error) {
      console.error(
        `[ToolService] parseParametersWithAI: Failed to call local AI server:`,
        error
      );
      const errorMessage =
        typeof error === "string"
          ? error
          : error instanceof Error
          ? error.message
          : "An unknown error occurred during parameter parsing.";
      throw new Error(errorMessage);
    }
  }

  /**
   * Execute tool
   */
  async executeTool(
    request: ToolExecutionRequest
  ): Promise<ToolExecutionResult> {
    console.log(
      "[ToolService] executeTool: Attempting to execute tool via Tauri with request:",
      request
    );
    try {
      // The backend now returns a JSON string containing the result and display preference.
      const jsonResult = await invoke<string>("execute_tool", { request });
      console.log(
        '[ToolService] executeTool: Tauri command "execute_tool" returned successfully with JSON result:',
        jsonResult
      );

      // Parse the JSON string into a structured object.
      const structuredResult: ToolExecutionResult = JSON.parse(jsonResult);
      console.log(
        "[ToolService] executeTool: Parsed structured result:",
        structuredResult
      );

      return structuredResult;
    } catch (error) {
      console.error(
        '[ToolService] executeTool: Tauri command "execute_tool" invocation failed:',
        error
      );
      throw new Error(`Workflow execution failed: ${error}`);
    }
  }

  /**
   * Check if tool exists
   */
  async toolExists(toolName: string): Promise<boolean> {
    try {
      const tools = await this.getAvailableTools();
      return tools.some((tool) => tool.name === toolName);
    } catch (error) {
      console.error("Failed to check tool existence:", error);
      return false;
    }
  }

  /**
   * Get tool information
   */
  async getToolInfo(toolName: string): Promise<ToolUIInfo | null> {
    try {
      const tools = await this.getAvailableTools();
      const tool = tools.find((tool) => tool.name === toolName);
      if (!tool) {
        // Return null instead of throwing, allows for graceful checking.
        console.warn(`Tool "${toolName}" does not exist.`);
        return null;
      }
      return tool;
    } catch (error) {
      console.error("Failed to get tool info:", error);
      // Re-throw to be handled by the caller
      throw new Error(
        `Failed to get information for tool "${toolName}": ${error}`
      );
    }
  }

  /**
   * Checks if a tool requires user approval before execution.
   * This is based on the tool's definition in the backend.
   */
  async toolRequiresApproval(toolName: string): Promise<boolean> {
    try {
      const toolInfo = await this.getToolInfo(toolName);
      // Corresponds to the `required_approval` field in the Rust Tool trait.
      // If tool not found or info is incomplete, default to requiring approval for safety.
      return toolInfo?.required_approval ?? true;
    } catch (error) {
      console.error(`Error checking approval for tool "${toolName}":`, error);
      // Default to true for safety if there's an error fetching info.
      return true;
    }
  }

  /**
   * Gets all available tools (built-in and MCP) and formats them as a string
   * to be injected into the system prompt.
   */
  async getAllToolsForPrompt(): Promise<string> {
    let toolDefinitions = "<tools>\n";

    try {
      // 1. Get built-in tools
      const builtInTools = await this.getAvailableTools();
      for (const tool of builtInTools) {
        toolDefinitions += "  <tool>\n";
        toolDefinitions += `    <name>${tool.name}</name>\n`;
        toolDefinitions += `    <description>${tool.description}</description>\n`;
        toolDefinitions += "    <parameters>\n";
        for (const param of tool.parameters) {
          toolDefinitions += `      <parameter name="${param.name}" type="${param.type}" required="${param.required}">${param.description}</parameter>\n`;
        }
        toolDefinitions += "    </parameters>\n";
        toolDefinitions += "  </tool>\n";
      }

      // 2. Get MCP tools
      // TODO: Implement the `get_mcp_tools` command in the Rust backend.
      // This command should return a list of ToolUIInfo for all connected MCP servers.
      // const mcpTools = await invoke<ToolUIInfo[]>("get_mcp_tools");
      // for (const tool of mcpTools) {
      //   ... (add similar XML formatting for MCP tools) ...
      // }
    } catch (error) {
      console.error("Failed to get all tools for prompt:", error);
    }

    toolDefinitions += "</tools>";
    return toolDefinitions;
  }
}
