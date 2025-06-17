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
  ai_response_template?: string; // Keep field name consistent, but content is custom_prompt
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
    const systemPrompt = this.buildParameterParsingPrompt(
      tool,
      toolCall.user_description
    );

    const messages: Message[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: toolCall.user_description,
      },
    ];

    // Call LLM to parse parameters
    const aiResponse = await sendLLMRequest(messages);

    // Parse parameters returned by AI
    return this.parseAIParameterResponse(
      aiResponse,
      tool,
      toolCall.user_description
    );
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
  private buildParameterParsingPrompt(
    tool: ToolUIInfo,
    userDescription: string
  ): string {
    const parametersDesc = tool.parameters
      .map(
        (p) =>
          `- ${p.name}: ${p.description} (${
            p.required ? "required" : "optional"
          })`
      )
      .join("\n");

    return `You are a parameter parser for tool execution. Based on the user's description, extract the required parameters for the tool and return ONLY the parameter values in the exact format needed.

Tool: ${tool.name}
Description: ${tool.description}
Parameters:
${parametersDesc}

For execute_command tool, return only the shell command.
For create_file tool, return the file path and content separated by '|||'.
For read_file/delete_file tools, return only the file path.

User request: ${userDescription}

Respond with only the parameter value(s), no explanation:`;
  }

  /**
   * Parse AI parameter response
   */
  private parseAIParameterResponse(
    aiResponse: string,
    tool: ToolUIInfo,
    userDescription: string
  ): ParameterValue[] {
    const trimmedResponse = aiResponse.trim();

    if (!trimmedResponse) {
      throw new Error("AI returned empty parameters");
    }

    const parameters: ParameterValue[] = [];

    // Parse parameters based on tool type
    switch (tool.name) {
      case "execute_command":
        parameters.push({
          name: "command",
          value: trimmedResponse,
        });
        break;

      case "create_file":
        if (trimmedResponse.includes("|||")) {
          const parts = trimmedResponse.split("|||");
          if (parts.length >= 2) {
            parameters.push(
              { name: "path", value: parts[0].trim() },
              { name: "content", value: parts[1].trim() }
            );
          }
        } else {
          // Fallback: use original description
          parameters.push(
            { name: "path", value: "test.txt" },
            { name: "content", value: userDescription }
          );
        }
        break;

      case "read_file":
      case "delete_file":
        parameters.push({
          name: "path",
          value: trimmedResponse,
        });
        break;

      default:
        // Default: use AI-parsed parameters for the first parameter
        if (tool.parameters.length > 0) {
          parameters.push({
            name: tool.parameters[0].name,
            value: trimmedResponse,
          });
        }
        break;
    }

    return parameters;
  }

  /**
   * Format tool execution result
   */
  formatToolResult(
    toolName: string,
    parameters: ParameterValue[],
    result: string
  ): string {
    const paramStr = parameters.map((p) => `${p.name}: ${p.value}`).join(", ");

    // Select appropriate code block language based on tool type
    let codeLanguage = "text";
    switch (toolName) {
      case "execute_command":
        codeLanguage = "bash";
        break;
      case "create_file":
      case "read_file":
        // Try to infer language from file extension
        const fileParam = parameters.find(
          (p) => p.name === "path" || p.name === "file_path"
        );
        if (fileParam) {
          const ext = fileParam.value.split(".").pop()?.toLowerCase();
          switch (ext) {
            case "js":
            case "jsx":
              codeLanguage = "javascript";
              break;
            case "ts":
            case "tsx":
              codeLanguage = "typescript";
              break;
            case "py":
              codeLanguage = "python";
              break;
            case "rs":
              codeLanguage = "rust";
              break;
            case "json":
              codeLanguage = "json";
              break;
            case "md":
              codeLanguage = "markdown";
              break;
            case "html":
              codeLanguage = "html";
              break;
            case "css":
              codeLanguage = "css";
              break;
            case "sh":
              codeLanguage = "bash";
              break;
            default:
              codeLanguage = "text";
          }
        }
        break;
      case "list_files":
        codeLanguage = "bash";
        break;
      default:
        codeLanguage = "text";
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
      return tools.find((tool) => tool.name === toolName) || null;
    } catch (error) {
      console.error("Failed to get tool info:", error);
      return null;
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
      return true; // Allow all tools when no system prompt
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (!preset || preset.mode !== "tool_specific") {
        return true; // General mode allows all tools
      }

      return preset.allowedTools?.includes(toolName) || false;
    } catch (error) {
      console.error("Failed to check tool permission:", error);
      return true; // Default allow on error
    }
  }

  /**
   * Auto add tool prefix
   */
  async autoAddToolPrefix(
    message: string,
    systemPromptId: string
  ): Promise<string> {
    if (!systemPromptId || !message.trim()) {
      return message;
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (preset?.mode === "tool_specific" && preset.autoToolPrefix) {
        // Check if message already contains tool prefix
        if (!message.startsWith("/")) {
          return `${preset.autoToolPrefix} ${message}`;
        }
      }
      return message;
    } catch (error) {
      console.error("Failed to auto add tool prefix:", error);
      return message;
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
      return { isValid: true };
    }

    try {
      const preset = await this.systemPromptService.findPresetById(
        systemPromptId
      );

      if (preset?.restrictConversation) {
        // Check if it's a tool call
        const isToolCall = this.parseToolCallFormat(content) !== null;
        if (!isToolCall) {
          return {
            isValid: false,
            errorMessage:
              "Current mode only supports tool calls, normal conversation is not supported",
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error("Failed to validate conversation:", error);
      return { isValid: true }; // Default allow on error
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
}
