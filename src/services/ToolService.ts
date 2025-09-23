import { invoke } from "@tauri-apps/api/core";
import OpenAI from 'openai';
import { ToolExecutionResult } from "../types/chat";

export interface ToolCallRequest {
  tool_name: string;
  user_description: string;
  parameter_parsing_strategy?: 'AIParameterParsing' | 'RegexParameterExtraction';
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
  parameter_parsing_strategy?: 'AIParameterParsing' | 'RegexParameterExtraction';
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
    console.log(`[ToolService] parseUserCommand: Parsing content: "${content}"`);
    const trimmedContent = content.trim();
    if (!trimmedContent.startsWith('/')) {
      console.log('[ToolService] parseUserCommand: Content does not start with "/", not a tool command.');
      return null;
    }

    const spaceIndex = trimmedContent.indexOf(' ');
    let tool_name;
    let user_description;

    if (spaceIndex === -1) {
      // Command is just "/tool_name"
      tool_name = trimmedContent.substring(1);
      user_description = '';
    } else {
      // Command is "/tool_name with description"
      tool_name = trimmedContent.substring(1, spaceIndex);
      user_description = trimmedContent.substring(spaceIndex + 1).trim();
    }

    if (tool_name) {
      const result = { tool_name, user_description };
      console.log('[ToolService] parseUserCommand: Successfully parsed command:', result);
      return result;
    }

    console.log('[ToolService] parseUserCommand: Failed to parse tool name from content.');
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
      const response = await invoke<ToolsUIResponse>("get_tools_for_ui", { categoryId: null });
      if (response && Array.isArray(response.tools)) {
        return response.tools;
      }
      // Fallback for safety, in case the response is not as expected.
      return [];
    } catch (error) {
      console.error("Failed to get available tools:", error);
      throw new Error(`Failed to get available tools: ${error}`);
    }
  }

  /**
   * Get tools for a specific category.
   * @param categoryId The ID of the category.
   */
  async getToolsForCategory(categoryId: string): Promise<ToolUIInfo[]> {
    try {
      console.log(`[ToolService] Fetching tools for category: ${categoryId}`);
      const response = await invoke<ToolsUIResponse>("get_tools_for_ui", { categoryId });
      if (response && Array.isArray(response.tools)) {
        console.log(`[ToolService] Found ${response.tools.length} tools for category ${categoryId}.`);
        return response.tools;
      }
      console.warn(`[ToolService] No tools found or invalid response for category ${categoryId}.`);
      return [];
    } catch (error) {
      console.error(`Failed to get tools for category ${categoryId}:`, error);
      throw new Error(`Failed to get tools for category ${categoryId}: ${error}`);
    }
  }

  /**
   * Parses tool parameters using an AI model.
   * This is a dedicated method to be called by the state machine.
   */
  async parseParametersWithAI(toolCall: ToolCallRequest): Promise<ParameterValue[]> {
    console.log(`[ToolService] parseParametersWithAI: Starting AI parsing for tool "${toolCall.tool_name}"`);
    const toolInfo = await this.getToolInfo(toolCall.tool_name);
    if (!toolInfo) {
      throw new Error(`Tool "${toolCall.tool_name}" not found for AI parameter parsing.`);
    }

    if (!toolInfo.ai_prompt_template) {
      throw new Error(`Tool "${toolCall.tool_name}" is not configured for AI parameter parsing (missing prompt template).`);
    }

    // Use the prompt template from the backend, replacing the placeholder.
    const systemPrompt = toolInfo.ai_prompt_template.replace('{user_description}', toolCall.user_description);
    
    const messages = [
      { role: "system", content: systemPrompt },
      // The user's raw input is still valuable context for the AI.
      { role: "user", content: toolCall.user_description },
    ];

    try {
      // Use the OpenAI client to call the local web server, same as AIService
      const client = new OpenAI({
        baseURL: 'http://localhost:8080/v1',
        apiKey: 'dummy-key',
        dangerouslyAllowBrowser: true,
      });

      const response = await client.chat.completions.create({
        model: 'gpt-4.1', // Or a model configured for this task
        messages: messages as any,
        stream: false,
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("AI did not return a valid response for parameter parsing.");
      }

      console.log(`[ToolService] parseParametersWithAI: AI response: "${aiResponse}"`);

      // The AI's response IS the parameter value.
      if (toolInfo.parameters.length === 1) {
        const parsedParams: ParameterValue[] = [{
          name: toolInfo.parameters[0].name,
          value: aiResponse.trim(),
        }];
        console.log('[ToolService] parseParametersWithAI: Parsed parameters:', parsedParams);
        return parsedParams;
      }

      console.warn(`[ToolService] AI parameter parsing for multi-parameter tools is not fully implemented. Using fallback.`);
      return [{ name: "parameters", value: aiResponse.trim() }];
    } catch (error) {
      console.error(`[ToolService] parseParametersWithAI: Failed to call local AI server:`, error);
      const errorMessage = typeof error === 'string' ? error : (error instanceof Error ? error.message : 'An unknown error occurred during parameter parsing.');
      throw new Error(errorMessage);
    }
  }

  /**
   * Execute tool
   */
  async executeTool(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    console.log('[ToolService] executeTool: Attempting to execute tool via Tauri with request:', request);
    try {
      // The backend now returns a JSON string containing the result and display preference.
      const jsonResult = await invoke<string>("execute_tool", { request });
      console.log('[ToolService] executeTool: Tauri command "execute_tool" returned successfully with JSON result:', jsonResult);
      
      // Parse the JSON string into a structured object.
      const structuredResult: ToolExecutionResult = JSON.parse(jsonResult);
      console.log('[ToolService] executeTool: Parsed structured result:', structuredResult);
      
      return structuredResult;
    } catch (error) {
      console.error('[ToolService] executeTool: Tauri command "execute_tool" invocation failed:', error);
      throw new Error(`Tool execution failed: ${error}`);
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
      throw new Error(`Failed to get information for tool "${toolName}": ${error}`);
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
   * Get tool category weight (for sorting)
   */
  async getCategoryWeight(categoryId: string): Promise<number> {
    try {
      // Use the new get_tool_categories command to get categories sorted by priority
      const categories = await invoke<any[]>('get_tool_categories');

      // Calculate weight based on the category's position in the array
      // The array is already sorted by priority, so the index is the weight
      const categoryIndex = categories.findIndex(cat => cat.id === categoryId);

      if (categoryIndex === -1) {
        throw new Error(`Sort weight for tool category "${categoryId}" is not configured. Please check if the category is registered in the backend.`);
      }

      return categoryIndex + 1; // Weight starts from 1
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get weight for tool category "${categoryId}": ${errorMessage}`);
    }
  }

  /**
   * Get tool category display information
   */
  async getCategoryDisplayInfo(categoryId: string): Promise<{
    name: string;
    icon: string;
    description: string;
    color?: string;
  }> {
    try {
      // Use the new get_tool_categories command to get category information
      const categories = await invoke<any[]>('get_tool_categories');

      // Find the specified category
      const category = categories.find(cat => cat.id === categoryId);

      if (!category) {
        throw new Error(`Tool category "${categoryId}" not found. Please check if the category is registered in the backend.`);
      }

      // Return display information, directly using data provided by the backend without any hardcoded mapping
      return {
        name: category.display_name || category.name || categoryId,
        icon: category.emoji_icon || '🔧', // Use emoji icon instead of string name
        description: category.description || '',
        color: category.color || '#666666' // Directly use the color provided by the backend, or a default value if not available
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get display information for tool category "${categoryId}": ${errorMessage}`);
    }
  }


}
