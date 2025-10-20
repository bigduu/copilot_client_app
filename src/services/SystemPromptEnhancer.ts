import {
  isMermaidEnhancementEnabled,
  getMermaidEnhancementPrompt,
} from "../utils/mermaidUtils";
import { ToolService } from "./ToolService";

/**
 * Service for enhancing system prompts with dynamic content like tool definitions and Mermaid diagrams.
 */
export default class SystemPromptEnhancer {
  /**
   * Enhances a base system prompt with dynamic content like tool definitions.
   * @param basePrompt The user-selected system prompt content.
   * @returns The final, enhanced system prompt string.
   */
  public static async getEnhancedSystemPrompt(
    basePrompt: string
  ): Promise<string> {
    const toolService = ToolService.getInstance();
    let finalPrompt = basePrompt;

    // 1. Add all available tool definitions (built-in + MCP)
    const toolDefinitions = await toolService.getAllToolsForPrompt();
    finalPrompt += `\n\n${toolDefinitions}`;

    // 2. Add Mermaid enhancement if enabled
    if (isMermaidEnhancementEnabled()) {
      finalPrompt += getMermaidEnhancementPrompt();
    }

    return finalPrompt;
  }
}
