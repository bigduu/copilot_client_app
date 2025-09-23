import { isMermaidEnhancementEnabled, getMermaidEnhancementPrompt } from '../utils/mermaidUtils';
import { ChatItem, SystemPromptPreset } from '../types/chat';
import { ToolService, ToolUIInfo } from './ToolService';
import { SystemPromptService } from './SystemPromptService';

/**
 * Service for enhancing system prompts with dynamic content like tool definitions and Mermaid diagrams.
 */
export default class SystemPromptEnhancer {
  /**
   * Formats the definitions of available tools into a string for the system prompt.
   * @param tools A list of available tools.
   * @returns A formatted string of tool definitions.
   */
  private static formatToolDefinitions(tools: ToolUIInfo[]): string {
    if (!tools || tools.length === 0) {
      return '';
    }

    const toolDefs = tools.map(tool => {
      const params = tool.parameters.map(p => `  - ${p.name} (${p.type}): ${p.description}`).join('\n');
      return `
### Tool: ${tool.name}
- Description: ${tool.description}
- Parameters:
${params}
`;
    }).join('');

    return `

## Available Tools
You have access to the following tools. To complete the user's request, you must analyze their intent. If you determine that you need information or to perform an action, you should call the appropriate tool.
${toolDefs}
`;
  }

  /**
   * Gets the appropriate system prompt for a chat, considering presets,
   * available tools, and other dynamic enhancements like Mermaid diagrams.
   * @param chat The chat item, containing system prompt info.
   * @returns The final, enhanced system prompt string.
   */
  public static async getEnhancedSystemPrompt(
    chat: Partial<ChatItem>,
  ): Promise<string> {
    const systemPromptService = SystemPromptService.getInstance();
    const toolService = ToolService.getInstance();

    const presets = await systemPromptService.getSystemPromptPresets();
    const preset = presets.find((p: SystemPromptPreset) => p.id === chat.config?.systemPromptId);
    let basePrompt = chat.config?.lastUsedEnhancedPrompt || preset?.content || "You are a helpful assistant.";
    
    if (!chat.config?.systemPromptId) {
        console.warn("No systemPromptId found in chat. Skipping tool enhancement.");
        return basePrompt;
    }

    // 1. Add tool definitions by fetching tools for the specific category
    const availableTools = await toolService.getToolsForCategory(chat.config.systemPromptId);
    const toolDefinitions = this.formatToolDefinitions(availableTools);
    basePrompt += toolDefinitions;

    // 2. Add Mermaid enhancement if enabled
    if (isMermaidEnhancementEnabled()) {
      basePrompt += getMermaidEnhancementPrompt();
    }
    
    return basePrompt;
  }
}
