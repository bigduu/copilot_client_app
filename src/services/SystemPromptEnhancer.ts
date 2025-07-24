import { invoke } from "@tauri-apps/api/core";
import { ToolUIInfo } from "./ToolService";

export interface CategoryInfo {
  id: string;
  name: string;
  display_name: string;
  description: string;
  system_prompt: string;
  strict_tools_mode: boolean;
  enabled: boolean;
  tools: ToolUIInfo[];
}

/**
 * Service for enhancing system prompts with tool information
 * Handles dynamic system prompt generation for non-strict mode categories
 */
export class SystemPromptEnhancer {
  private static instance: SystemPromptEnhancer;
  private categoryCache: Map<string, CategoryInfo> = new Map();
  private toolsCache: ToolUIInfo[] = [];
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): SystemPromptEnhancer {
    if (!SystemPromptEnhancer.instance) {
      SystemPromptEnhancer.instance = new SystemPromptEnhancer();
    }
    return SystemPromptEnhancer.instance;
  }

  /**
   * Get category information by ID
   */
  private async getCategoryInfo(categoryId: string): Promise<CategoryInfo | null> {
    await this.refreshCacheIfNeeded();
    return this.categoryCache.get(categoryId) || null;
  }

  /**
   * Refresh cache if expired
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now > this.cacheExpiry) {
      await this.refreshCache();
    }
  }

  /**
   * Refresh category and tools cache
   */
  private async refreshCache(): Promise<void> {
    try {
      // Get all categories
      const categories = await invoke<any[]>("get_tool_categories");

      // Clear and rebuild cache
      this.categoryCache.clear();

      // Build category info with associated tools
      for (const category of categories) {
        // Get tools for this specific category
        const categoryTools = await invoke<ToolUIInfo[]>("get_tools_for_ui", {
          category_id: category.id
        });

        const categoryInfo: CategoryInfo = {
          id: category.id,
          name: category.name,
          display_name: category.display_name || category.name,
          description: category.description,
          system_prompt: category.system_prompt,
          strict_tools_mode: category.strict_tools_mode || false,
          enabled: category.enabled !== false,
          tools: categoryTools
        };

        this.categoryCache.set(category.id, categoryInfo);
      }

      // Get all tools for general cache
      this.toolsCache = await invoke<ToolUIInfo[]>("get_tools_for_ui");

      // Update cache expiry
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;

      console.log("[SystemPromptEnhancer] Cache refreshed with", this.categoryCache.size, "categories and", this.toolsCache.length, "tools");
    } catch (error) {
      console.error("[SystemPromptEnhancer] Failed to refresh cache:", error);
      throw error;
    }
  }

  /**
   * Check if a category is in strict tools mode
   */
  async isStrictMode(categoryId: string): Promise<boolean> {
    const categoryInfo = await this.getCategoryInfo(categoryId);
    return categoryInfo?.strict_tools_mode || false;
  }

  /**
   * Build enhanced system prompt for non-strict mode categories
   */
  async buildEnhancedSystemPrompt(categoryId: string): Promise<string> {
    const categoryInfo = await this.getCategoryInfo(categoryId);
    
    if (!categoryInfo) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    
    // If strict mode, return original prompt
    if (categoryInfo.strict_tools_mode) {
      return categoryInfo.system_prompt;
    }
    
    // Build enhanced prompt with tool information
    const originalPrompt = categoryInfo.system_prompt;
    const tools = categoryInfo.tools;
    
    if (!tools || tools.length === 0) {
      return originalPrompt;
    }
    
    // Format tool information
    const toolsInfo = tools.map(tool => {
      const params = tool.parameters.map(p => 
        `${p.name} (${p.required ? 'required' : 'optional'}): ${p.description}`
      ).join(', ');
      
      return `- ${tool.name}: ${tool.description}${params ? `\n  Parameters: ${params}` : ''}`;
    }).join('\n');
    
    // Build enhanced system prompt with clear separation
    const enhancedPrompt = `${originalPrompt}

-------

## 🛠️ Available Tools

You have access to the following tools that can help you assist the user:

${toolsInfo}

## 📋 Tool Usage Instructions

**IMPORTANT**: When a user's request requires tool usage, you MUST call the appropriate tool using the exact JSON format below.

### 1. **Automatic Tool Calling**
You should automatically decide to call tools when they would be helpful for the user's request. Don't ask for permission - just call the tool directly.

### 2. **Tool Call Format**
When you decide to call a tool, use this EXACT JSON format (no additional text before or after):
\`\`\`json
{
  "tool_call": "tool_name",
  "parameters": [
    {"name": "parameter_name", "value": "parameter_value"}
  ]
}
\`\`\`

### 3. **Examples of When to Call Tools**
- User asks to "list files" or "show directory" → Use \`execute_command\` with \`ls\` command
- User asks to "read a file" → Use \`read_file\` tool
- User asks to "search for something" → Use \`search\` or \`search_files\` tool
- User asks to "create/update/delete files" → Use appropriate file tools

### 4. **Manual Tool Calls**
Users can also manually call tools using: \`/tool_name description\`

### 5. **Decision Making**
- If user request requires tool usage → Call the tool immediately with JSON format
- If user request is conversational → Respond normally without tools
- When in doubt about file operations → Use tools to get accurate information

**Remember**: Be proactive with tool usage. If a user asks for file system operations, directory listings, file content, or searches, use the appropriate tools immediately.`;

    return enhancedPrompt;
  }

  /**
   * Get original system prompt (without enhancement)
   */
  async getOriginalSystemPrompt(categoryId: string): Promise<string> {
    const categoryInfo = await this.getCategoryInfo(categoryId);
    
    if (!categoryInfo) {
      throw new Error(`Category not found: ${categoryId}`);
    }
    
    return categoryInfo.system_prompt;
  }

  /**
   * Clear cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.categoryCache.clear();
    this.toolsCache = [];
    this.cacheExpiry = 0;
  }

  /**
   * Get all available categories
   */
  async getAvailableCategories(): Promise<CategoryInfo[]> {
    await this.refreshCacheIfNeeded();
    return Array.from(this.categoryCache.values()).filter(cat => cat.enabled);
  }

  /**
   * Get tools for a specific category
   */
  async getCategoryTools(categoryId: string): Promise<ToolUIInfo[]> {
    const categoryInfo = await this.getCategoryInfo(categoryId);
    return categoryInfo?.tools || [];
  }
}

export default SystemPromptEnhancer;
