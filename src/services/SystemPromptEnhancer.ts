import { isMermaidEnhancementEnabled, getMermaidEnhancementPrompt } from '../utils/mermaidUtils';
import { ChatItem, SystemPromptPreset } from '../types/chat';

/**
 * Service for enhancing system prompts.
 */
export default class SystemPromptEnhancer {
  /**
   * Gets the appropriate system prompt for a chat, considering presets
   * and other dynamic enhancements like Mermaid diagrams.
   * @param chat The chat item, containing system prompt info.
   * @param presets A list of available system prompt presets.
   * @returns The final, enhanced system prompt string.
   */
  public static getEnhancedSystemPrompt(
    chat: Partial<ChatItem>,
    presets: SystemPromptPreset[]
  ): string {
    const preset = presets.find(p => p.id === chat.systemPromptId);
    const basePrompt = chat.systemPrompt || preset?.content || "You are a helpful assistant.";

    // This is a simplified version. In a real scenario, you might add more complex logic,
    // like dynamically adding tool definitions.
    if (isMermaidEnhancementEnabled()) {
      return `${basePrompt}${getMermaidEnhancementPrompt()}`;
    }
    
    return basePrompt;
  }
}