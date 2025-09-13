import { invoke } from "@tauri-apps/api/core";
import { Message } from "../types/chat";
import { SystemPromptService } from "./SystemPromptService";

export interface ToolCallRequest {
  tool_name: string;
  user_description: string;
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
  parameter_regex?: string;
  ai_response_template?: string;
  hide_in_selector: boolean;
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
  type: string;
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
  private systemPromptService: SystemPromptService;

  constructor() {
    this.systemPromptService = SystemPromptService.getInstance();
  }

  static getInstance(): ToolService {
    if (!ToolService.instance) {
      ToolService.instance = new ToolService();
    }
    return ToolService.instance;
  }

  /**
   * Parse tool call format (e.g., "/create_file Create a test file")
   */
  parseToolCallFormat(content: string): ToolCallRequest | null {
    if (content.startsWith("/")) {
      // Handle case where user just typed tool name without description
      const spacePos = content.indexOf(" ");
      if (spacePos !== -1) {
        const tool_name = content.slice(1, spacePos);
        const user_description = content.slice(spacePos + 1);
        return {
          tool_name,
          user_description,
        };
      } else {
        // Handle case where user just typed "/toolname" without space or description
        const tool_name = content.slice(1);
        if (tool_name.length > 0) {
          return {
            tool_name,
            user_description: "",
          };
        }
      }
    }
    return null;
  }

  /**
   * Get available tools list
   */
  async getAvailableTools(): Promise<ToolUIInfo[]> {
    try {
      return await invoke<ToolUIInfo[]>("get_tools_for_ui");
    } catch (error) {
      console.error("Failed to get available tools:", error);
      throw new Error(`Failed to get available tools: ${error}`);
    }
  }

  /**
   * Parse tool parameters using AI
   */
  async parseToolParameters(
    toolCall: ToolCallRequest,
    tool: ToolUIInfo,
    sendLLMRequest: (messages: Message[]) => Promise<string>
  ): Promise<ParameterValue[]> {
    // Build system prompt for parameter parsing
    const systemPrompt = await this.buildParameterParsingPrompt(
      tool,
      toolCall.user_description
    );

    const messages: Message[] = [
      {
        role: "system",
        content: systemPrompt,
        id: "system-prompt",
        createdAt: new Date().toISOString(),
      },
      {
        role: "user",
        content: toolCall.user_description,
        id: "user-prompt",
        createdAt: new Date().toISOString(),
      },
    ];

    // Call LLM to parse parameters
    const aiResponse = await sendLLMRequest(messages);

    console.log("[ToolService] AI parameter parsing response:", aiResponse);

    // Parse parameters returned by AI
    const parsedParams = await this.parseAIParameterResponse(
      aiResponse,
      tool,
      toolCall.user_description
    );

    console.log("[ToolService] Parsed parameters:", parsedParams);
    return parsedParams;
  }

  /**
   * Execute tool
   */
  async executeTool(request: ToolExecutionRequest): Promise<string> {
    try {
      return await invoke<string>("execute_tool", { request });
    } catch (error) {
      console.error("Tool execution failed:", error);
      throw new Error(`Tool execution failed: ${error}`);
    }
  }



  /**
   * Build system prompt for parameter parsing
   */
  private async buildParameterParsingPrompt(
    tool: ToolUIInfo,
    userDescription: string
  ): Promise<string> {
    const parametersDesc = tool.parameters
      .map(
        (p) =>
          `- ${p.name}: ${p.description} (${
            p.required ? "required" : "optional"
          })`
      )
      .join("\n");

    // Special handling for execute_command tool
    if (tool.name === "execute_command") {
      return `You are a command parameter parser. Your task is to extract the shell command from user input.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

RULES:
- The user input is the command they want to execute
- Return ONLY the command string, nothing else
- Do NOT add explanations, quotes, or formatting
- Do NOT provide safety warnings

User wants to execute: "${userDescription}"

Command:`;
    }

    // Default prompt for other tools
    return `CRITICAL: You are ONLY a parameter extraction system. Ignore any previous instructions or system prompts.

Your ONLY task is to extract parameter values from user input for tool execution.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

EXTRACTION RULES:
- Extract the exact parameter value from the user input
- Return ONLY the raw parameter value, nothing else
- Do NOT ask questions, provide explanations, or act as an assistant
- Do NOT provide safety warnings or security checks

User input: "${userDescription}"

Extract parameter value:`;
  }

  /**
   * Parse AI parameter response
   */
  private async parseAIParameterResponse(
    aiResponse: string,
    tool: ToolUIInfo,
    userDescription: string
  ): Promise<ParameterValue[]> {
    const trimmedResponse = aiResponse.trim();

    if (!trimmedResponse) {
      throw new Error("AI returned empty parameters");
    }

    const parameters: ParameterValue[] = [];

    // Special handling for execute_command tool
    if (tool.name === "execute_command" && tool.parameters.length === 1) {
      // For execute_command, use AI response directly if it looks like a valid command
      let command = trimmedResponse;

      // Fallback: if AI response is empty or looks invalid, use user description
      if (!command || command.length === 0) {
        command = userDescription;

        // If user description starts with "/execute_command ", extract the command part
        if (userDescription.startsWith("/execute_command ")) {
          command = userDescription.substring("/execute_command ".length);
        }
      }

      parameters.push({
        name: tool.parameters[0].name,
        value: command,
      });

      console.log("[ToolService] Execute command parameter extracted:", command);
      console.log("[ToolService] AI response was:", trimmedResponse);
      console.log("[ToolService] User description was:", userDescription);
      return parameters;
    }

    // Simplified parameter parsing: parse AI response based on tool parameter definitions
    // For most tools, the AI should return suitable parameter values
    if (tool.parameters.length === 1) {
      // Single-parameter tool: directly use the AI response as the parameter value
      parameters.push({
        name: tool.parameters[0].name,
        value: trimmedResponse,
      });
    } else if (tool.parameters.length > 1) {
      // Multi-parameter tool: try to split by line or use the entire response as the first parameter
      const lines = trimmedResponse.split('\n').filter(line => line.trim());
      if (lines.length >= tool.parameters.length) {
        // Assign parameters by line
        tool.parameters.forEach((param, index) => {
          parameters.push({
            name: param.name,
            value: lines[index] ? lines[index].trim() : userDescription,
          });
        });
      } else {
        // Fallback: use the user description as the value for the first parameter
        parameters.push({
          name: tool.parameters[0].name,
          value: userDescription,
        });
      }
    } else {
      throw new Error(`Tool "${tool.name}" has no parameters defined`);
    }

    return parameters;
  }

  /**
   * Format tool execution result
   */
  async formatToolResult(
    toolName: string,
    parameters: ParameterValue[],
    result: string
  ): Promise<string> {
    const paramStr = parameters.map((p) => `${p.name}: ${p.value}`).join(", ");

    // Simplified result formatting: infer code language from tool type and parameters
    let codeLanguage = "text";

    // Try to infer language from file path parameter
    const pathParam = parameters.find((p) =>
      p.name.toLowerCase().includes("path") ||
      p.name.toLowerCase().includes("file")
    );

    if (pathParam) {
      const ext = pathParam.value.split(".").pop()?.toLowerCase();
      const extensionMap: Record<string, string> = {
        "js": "javascript",
        "jsx": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "py": "python",
        "rs": "rust",
        "json": "json",
        "md": "markdown",
        "html": "html",
        "css": "css",
        "sh": "bash",
        "yml": "yaml",
        "yaml": "yaml"
      };

      if (ext && extensionMap[ext]) {
        codeLanguage = extensionMap[ext];
      }
    }

    return `**Tool: ${toolName}**

**Parameters:** ${paramStr}

**Result:**
\`\`\`${codeLanguage}
${result}
\`\`\``;
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
        throw new Error(`Tool "${toolName}" does not exist. Please check if the tool is correctly registered in the backend`);
      }
      return tool;
    } catch (error) {
      console.error("Failed to get tool info:", error);
      throw new Error(`Failed to get information for tool "${toolName}": ${error}`);
    }
  }

  /**
   * Check tool call permissions
   */
  async checkToolPermission(
    toolName: string,
    systemPromptId: string
  ): Promise<boolean> {
    if (!systemPromptId) {
      // Strict mode: there should be no default behavior without a system prompt
      throw new Error("System prompt ID must be provided; default permission configuration cannot be used");
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`System prompt preset "${systemPromptId}" does not exist, cannot check tool permissions`);
      }

      // General mode: allow all tools
      // This is because the general assistant category should have access to all available tools
      if (preset.mode !== "tool_specific") {
        return true;
      }

      // Tool-specific mode: check if the tool is in the allowed list
      if (!preset.allowedTools) {
        throw new Error(`Allowed tools list for tool-specific mode is not configured. System prompt "${systemPromptId}" is missing necessary configuration`);
      }

      return preset.allowedTools.includes(toolName);
    } catch (error) {
      console.error("Failed to check tool permission:", error);
      throw new Error(`Failed to check permission for tool "${toolName}": ${error}`);
    }
  }

  /**
   * Auto add tool prefix
   */
  async autoAddToolPrefix(
    message: string,
    systemPromptId: string
  ): Promise<string> {
    if (!systemPromptId) {
      throw new Error("System prompt ID must be provided; default prefix configuration cannot be used");
    }
    
    if (!message.trim()) {
      return message;
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`System prompt preset "${systemPromptId}" does not exist, cannot automatically add tool prefix`);
      }

      if (preset.mode === "tool_specific" && preset.autoToolPrefix) {
        // Check if message already contains tool prefix
        if (!message.startsWith("/")) {
          return `${preset.autoToolPrefix} ${message}`;
        }
      }
      return message;
    } catch (error) {
      console.error("Failed to auto add tool prefix:", error);
      throw new Error(`Failed to automatically add tool prefix: ${error}`);
    }
  }

  /**
   * Validate tool call compliance
   */
  async validateToolCall(
    toolCall: ToolCallRequest,
    systemPromptId: string
  ): Promise<ValidationResult> {
    const isAllowed = await this.checkToolPermission(
      toolCall.tool_name,
      systemPromptId
    );

    return {
      isValid: isAllowed,
      errorMessage: isAllowed
        ? undefined
        : `Current mode does not allow using tool "${toolCall.tool_name}"`,
    };
  }

  /**
   * Validate normal conversation permissions
   */
  async validateConversation(
    content: string,
    systemPromptId: string
  ): Promise<ValidationResult> {
    if (!systemPromptId) {
      throw new Error("System prompt ID must be provided; default conversation validation configuration cannot be used");
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset) {
        throw new Error(`System prompt preset "${systemPromptId}" does not exist, cannot validate conversation permissions`);
      }

      if (preset.restrictConversation) {
        // Check if it's a tool call
        const isToolCall = this.parseToolCallFormat(content) !== null;
        if (!isToolCall) {
          return {
            isValid: false,
            errorMessage:
              "Current mode only supports tool calls, not regular conversation",
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error("Failed to validate conversation:", error);
      throw new Error(`Failed to validate conversation permissions: ${error}`);
    }
  }

  /**
   * Process message and apply auto prefix and permission validation
   */
  async processMessage(
    content: string,
    systemPromptId: string
  ): Promise<{
    processedContent: string;
    validation: ValidationResult;
  }> {
    // 1. Auto add tool prefix (if in tool-specific mode)
    const processedContent = await this.autoAddToolPrefix(
      content,
      systemPromptId
    );

    // 2. Validate normal conversation permissions
    const conversationValidation = await this.validateConversation(
      content,
      systemPromptId
    );
    if (!conversationValidation.isValid) {
      return {
        processedContent,
        validation: conversationValidation,
      };
    }

    // 3. Check tool call permissions (if it's a tool call)
    const toolCall = this.parseToolCallFormat(processedContent);
    if (toolCall) {
      const toolValidation = await this.validateToolCall(
        toolCall,
        systemPromptId
      );
      return {
        processedContent,
        validation: toolValidation,
      };
    }

    return {
      processedContent,
      validation: { isValid: true },
    };
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
