import { Message } from "../types/chat";
import {
  ToolService,
  ToolCallRequest,
  ParameterValue,
  ToolUIInfo,
} from "./ToolService";
import { isApprovalRequest, parseApprovalRequest, createApprovalRequest } from "../utils/approvalUtils";

export enum ToolType {
  AIParameterParsing = "AIParameterParsing",
  RegexParameterExtraction = "RegexParameterExtraction",
}

export interface ToolCallResult {
  success: boolean;
  content: string;
  toolName: string;
  parameters: ParameterValue[];
}

export interface ProcessorUpdate {
  type: "processor_update";
  source: string;
  content: string;
}

/**
 * Independent tool call processor
 * Responsible for handling different types of tool call workflows
 */
export class ToolCallProcessor {
  private static instance: ToolCallProcessor;
  private toolService: ToolService;

  constructor() {
    this.toolService = ToolService.getInstance();
  }

  static getInstance(): ToolCallProcessor {
    if (!ToolCallProcessor.instance) {
      ToolCallProcessor.instance = new ToolCallProcessor();
    }
    return ToolCallProcessor.instance;
  }

  /**
   * Check if message is a tool call
   */
  isToolCall(content: string): boolean {
    return content.startsWith("/");
  }

  /**
   * Check if message is an approval request
   */
  isApprovalRequest(content: string): boolean {
    return isApprovalRequest(content);
  }

  /**
   * Parse tool call
   */
  parseToolCall(content: string): ToolCallRequest | null {
    return this.toolService.parseToolCallFormat(content);
  }

  /**
   * Process approval request and execute approved tool
   */
  async processApprovalRequest(
    content: string,
    onUpdate?: (update: ProcessorUpdate) => void,
    // sendLLMRequest?: (messages: Message[]) => Promise<string>
  ): Promise<ToolCallResult> {
    const approvalData = parseApprovalRequest(content);

    if (!approvalData) {
      return {
        success: false,
        content: "Invalid approval request format",
        toolName: "unknown",
        parameters: [],
      };
    }

    // Check if approved
    if (approvalData.approval !== true) {
      return {
        success: true,
        content: `Tool execution rejected: ${approvalData.tool_call}`,
        toolName: approvalData.tool_call,
        parameters: approvalData.parameters,
      };
    }

    // Execute the approved tool
    // const toolCall: ToolCallRequest = {
    //   tool_name: approvalData.tool_call,
    //   user_description: approvalData.parameters.map(p => p.value).join(' '),
    // };

    // Convert approval parameters to ParameterValue format
    const parameters: ParameterValue[] = approvalData.parameters.map(p => ({
      name: p.name,
      value: p.value,
    }));

    onUpdate?.({
      type: "processor_update",
      source: "ToolCallProcessor",
      content: `Executing approved tool: ${approvalData.tool_call}`,
    });

    try {
      const result = await this.toolService.executeTool({
        tool_name: approvalData.tool_call,
        parameters,
      });

      const formattedResult = await this.toolService.formatToolResult(
        approvalData.tool_call,
        parameters,
        result
      );

      return {
        success: true,
        content: formattedResult,
        toolName: approvalData.tool_call,
        parameters,
      };
    } catch (error) {
      return {
        success: false,
        content: `Tool execution failed: ${error}`,
        toolName: approvalData.tool_call,
        parameters,
      };
    }
  }

  /**
   * Execute tool and get result - for regex type tools
   */
  async executeToolAndGetResult(
    toolCall: ToolCallRequest,
    onUpdate?: (update: ProcessorUpdate) => void
  ): Promise<{
    success: boolean;
    toolResult: string;
    toolInfo: ToolUIInfo;
    parameters: ParameterValue[];
    error?: string;
  }> {
    try {
      // Send processing update
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Processing tool call: /${toolCall.tool_name} ${toolCall.user_description}`,
      });

      // 1. Check if tool exists
      const toolInfo = await this.toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        return {
          success: false,
          toolResult: "",
          toolInfo: {} as ToolUIInfo,
          parameters: [],
          error: `Tool '${toolCall.tool_name}' not found. Available tools: ${await this.getAvailableToolNames()}`,
        };
      }

      // 2. Extract parameters (only supports regex tools)
      if (!this.isRegexTool(toolInfo)) {
        return {
          success: false,
          toolResult: "",
          toolInfo,
          parameters: [],
          error: "This method only supports regex parameter extraction tools",
        };
      }

      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Extracting parameters using regex for tool: ${toolCall.tool_name}`,
      });

      const parameters = await this.extractParametersWithRegex(toolCall, toolInfo);

      // 3. Execute tool
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Executing tool: ${toolCall.tool_name}`,
      });

      const toolResult = await this.toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      return {
        success: true,
        toolResult,
        toolInfo,
        parameters,
      };
    } catch (error) {
      console.error("Tool execution failed:", error);
      return {
        success: false,
        toolResult: "",
        toolInfo: {} as ToolUIInfo,
        parameters: [],
        error: `Tool execution failed: ${error}`,
      };
    }
  }

  /**
   * Build AI response message - based on tool execution result
   */
  buildAIResponseMessage(
    toolInfo: ToolUIInfo,
    toolCall: ToolCallRequest,
    toolResult: string
  ): string {
    // Build user message, including tool execution result and custom prompts
    let userMessage = `Based on the tool execution result, please provide a helpful summary and explanation for: "${toolCall.user_description}"

Tool execution result:
${toolResult}`;

    // If tool provides custom AI response template, add it to message
    if (toolInfo.ai_response_template) {
      userMessage += `\n\nAdditional instructions: ${toolInfo.ai_response_template}`;
    }

    userMessage += "\n\nDo not include any tool calls (starting with '/') in your response.";

    return userMessage;
  }

  /**
   * Main entry point for processing tool calls - non-streaming version (maintains backward compatibility)
   */
  async processToolCall(
    toolCall: ToolCallRequest,
    onUpdate?: (update: ProcessorUpdate) => void,
    sendLLMRequest?: (messages: Message[]) => Promise<string>
  ): Promise<ToolCallResult> {
    try {
      // Send processing update
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Processing tool call: /${toolCall.tool_name} ${toolCall.user_description}`,
      });

      // 1. Check if tool exists
      const toolInfo = await this.toolService.getToolInfo(toolCall.tool_name);
      if (!toolInfo) {
        return {
          success: false,
          content: `Tool '${
            toolCall.tool_name
          }' not found. Available tools: ${await this.getAvailableToolNames()}`,
          toolName: toolCall.tool_name,
          parameters: [],
        };
      }

      // 2. Process parameters based on tool type
      let parameters: ParameterValue[];

      if (this.isRegexTool(toolInfo)) {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Extracting parameters using regex for tool: ${toolCall.tool_name}`,
        });
        parameters = await this.extractParametersWithRegex(toolCall, toolInfo);
      } else {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Analyzing parameters with AI for tool: ${toolCall.tool_name}`,
        });

        if (!sendLLMRequest) {
          throw new Error(
            "AI parameter parsing requires sendLLMRequest function"
          );
        }

        parameters = await this.toolService.parseToolParameters(
          toolCall,
          toolInfo,
          sendLLMRequest
        );

        console.log("[ToolCallProcessor] AI parsed parameters:", parameters);

        // For AI parameter parsing tools, return approval request instead of executing directly
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Creating approval request for tool: ${toolCall.tool_name}`,
        });

        const approvalRequest = createApprovalRequest(
          toolCall.tool_name,
          parameters
        );

        return {
          success: true,
          content: approvalRequest,
          toolName: toolCall.tool_name,
          parameters,
        };
      }

      // 3. Execute tool (only for regex tools)
      onUpdate?.({
        type: "processor_update",
        source: "ToolCallProcessor",
        content: `Executing tool: ${toolCall.tool_name}`,
      });

      const result = await this.toolService.executeTool({
        tool_name: toolCall.tool_name,
        parameters,
      });

      console.log("[ToolCallProcessor] Tool execution result:", result);

      // 4. Process results
      // For regex tools, use AI to summarize results
      // For AI parameter parsing tools, directly format results
      if (this.isRegexTool(toolInfo) && sendLLMRequest) {
        onUpdate?.({
          type: "processor_update",
          source: "ToolCallProcessor",
          content: `Generating AI summary for regex tool: ${toolCall.tool_name}`,
        });

        try {
          // Build prompt, using tool-provided template or default template
          const systemPrompt = this.buildAIResponsePrompt(
            toolInfo,
            toolCall,
            parameters,
            result
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

          // Call LLM to generate final response
          const aiResponse = await sendLLMRequest(messages);

          return {
            success: true,
            content: aiResponse,
            toolName: toolCall.tool_name,
            parameters,
          };
        } catch (aiError) {
          console.error(
            "AI response generation failed for regex tool:",
            aiError
          );
          // Fallback to formatted result
          const formattedResult = await this.toolService.formatToolResult(
            toolCall.tool_name,
            parameters,
            result
          );

          return {
            success: true,
            content: formattedResult,
            toolName: toolCall.tool_name,
            parameters,
          };
        }
      } else {
        // For AI parameter parsing tools, show the parsed parameters and then the result
        const formattedResult = await this.toolService.formatToolResult(
          toolCall.tool_name,
          parameters,
          result
        );

        // Format AI parsed parameters for display (wrapped in code blocks as per user preference)
        const parametersDisplay = parameters
          .map((p) => `${p.name}: ${p.value}`)
          .join(", ");

        const finalContent = `**Parameters:**
\`\`\`
${parametersDisplay}
\`\`\`

**Result:**
${formattedResult}`;

        return {
          success: true,
          content: finalContent,
          toolName: toolCall.tool_name,
          parameters,
        };
      }
    } catch (error) {
      console.error("Tool call processing failed:", error);
      return {
        success: false,
        content: `Tool execution failed: ${error}`,
        toolName: toolCall.tool_name,
        parameters: [],
      };
    }
  }

  /**
   * Check if tool is regex extraction type
   */
  private isRegexTool(toolInfo: ToolUIInfo): boolean {
    return toolInfo.tool_type === "RegexParameterExtraction";
  }

  /**
   * Build AI response prompt, base format + tool custom prompt
   */
  private buildAIResponsePrompt(
    toolInfo: ToolUIInfo,
    toolCall: ToolCallRequest,
    parameters: ParameterValue[],
    result: string
  ): string {
    // Base format (fixed)
    const basePrompt = `You are a helpful assistant. I executed the ${
      toolCall.tool_name
    } tool with the following parameters: ${parameters
      .map((p) => `${p.name}: ${p.value}`)
      .join(", ")}.

Result:
${result}

Based on the original request "${
      toolCall.user_description
    }" and the tool execution result above, please provide a helpful summary and explanation.`;

    // If tool provides custom prompt, append it after base format
    if (toolInfo.ai_response_template) {
      return `${basePrompt}

${toolInfo.ai_response_template}

Do not include any tool calls (starting with '/') in your response.`;
    }

    // Otherwise use default ending
    return `${basePrompt} Do not include any tool calls (starting with '/') in your response.`;
  }

  /**
   * Extract parameters using regular expressions
   */
  private async extractParametersWithRegex(
    toolCall: ToolCallRequest,
    toolInfo: ToolUIInfo
  ): Promise<ParameterValue[]> {
    const fullCommand = `/${toolCall.tool_name} ${toolCall.user_description}`;

    // Use tool-defined regex, or use default
    let regex: RegExp;

    if (toolInfo.parameter_regex) {
      regex = new RegExp(toolInfo.parameter_regex);
    } else {
      // Default regex: extract all content after tool name
      regex = new RegExp(`^\\/${toolInfo.name}\\s+(.+)$`);
    }

    const match = fullCommand.match(regex);
    if (!match) {
      throw new Error(`Failed to extract parameters from: ${fullCommand}`);
    }

    // Return parameter values based on tool's parameter definition
    const parameters: ParameterValue[] = [];

    if (toolInfo.parameters.length > 0) {
      // Assign matched content to first parameter
      parameters.push({
        name: toolInfo.parameters[0].name,
        value: match[1].trim(),
      });
    }

    return parameters;
  }

  /**
   * Get list of available tool names
   */
  private async getAvailableToolNames(): Promise<string> {
    try {
      const tools = await this.toolService.getAvailableTools();
      return tools.map((tool) => tool.name).join(", ");
    } catch (error) {
      return "Unable to fetch available tools";
    }
  }



  /**
   * Get tool type information (from backend)
   */
  async getToolTypeInfo(toolName: string): Promise<ToolType | null> {
    try {
      const toolInfo = await this.toolService.getToolInfo(toolName);
      if (!toolInfo) {
        return null;
      }

      return toolInfo.tool_type === "RegexParameterExtraction"
        ? ToolType.RegexParameterExtraction
        : ToolType.AIParameterParsing;
    } catch (error) {
      console.error("Failed to get tool type info:", error);
      return null;
    }
  }

  /**
   * Validate tool call format
   */
  validateToolCall(content: string): { valid: boolean; error?: string } {
    if (!content.startsWith("/")) {
      return { valid: false, error: "Tool call must start with '/'" };
    }

    const parts = content.slice(1).split(" ");
    if (parts.length === 0 || parts[0].trim() === "") {
      return { valid: false, error: "Tool name is required" };
    }

    return { valid: true };
  }
}
