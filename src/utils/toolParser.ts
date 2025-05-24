import { invoke } from '@tauri-apps/api/core';

export interface ToolInfo {
  name: string;
  type: 'local' | 'mcp';
  description: string;
  parameters: ParameterInfo[];
  requires_approval: boolean;
}

export interface ParameterInfo {
  name: string;
  description: string;
  required: boolean;
}

export interface ToolCall {
  tool_type: 'local' | 'mcp';
  tool_name: string;
  parameters: Record<string, any>;
  requires_approval: boolean;
}

export interface Parameter {
  name: string;
  description: string;
  required: boolean;
  value: string;
}

export class ToolParser {
  private availableTools: ToolInfo[] = [];

  /**
   * 加载可用工具列表
   */
  async loadAvailableTools(): Promise<void> {
    try {
      const xmlContent: string = await invoke('get_all_available_tools');
      this.availableTools = this.parseXmlToolList(xmlContent);
    } catch (error) {
      console.error('Failed to load available tools:', error);
      this.availableTools = [];
    }
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): ToolInfo[] {
    return this.availableTools;
  }

  /**
   * 解析XML格式的工具列表
   */
  parseXmlToolList(xmlContent: string): ToolInfo[] {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlContent, 'text/xml');
      const tools = doc.querySelectorAll('tool');
      
      return Array.from(tools).map(tool => {
        const nameElement = tool.querySelector('tool_name');
        const typeElement = tool.querySelector('tool_type');
        const descElement = tool.querySelector('tool_description');
        const approvalElement = tool.querySelector('tool_required_approval');
        const parametersElement = tool.querySelector('tool_parameters');

        const name = nameElement?.textContent?.trim() || '';
        const type = (typeElement?.textContent?.trim() || 'local') as 'local' | 'mcp';
        const description = descElement?.textContent?.trim() || '';
        const requires_approval = approvalElement?.textContent?.trim() === 'true';

        // 解析参数
        const parameters: ParameterInfo[] = [];
        if (parametersElement) {
          const paramElements = parametersElement.children;
          for (let i = 0; i < paramElements.length; i++) {
            const paramElement = paramElements[i];
            const paramName = paramElement.tagName;
            const paramDesc = paramElement.querySelector('parameter_description')?.textContent?.trim() || '';
            
            parameters.push({
              name: paramName,
              description: paramDesc,
              required: true // 默认设为必需，可以后续优化
            });
          }
        }

        return {
          name,
          type,
          description,
          parameters,
          requires_approval
        };
      });
    } catch (error) {
      console.error('Failed to parse XML tool list:', error);
      return [];
    }
  }

  /**
   * 生成包含工具信息的系统提示
   */
  generateSystemPrompt(): string {
    const localTools = this.availableTools.filter(t => t.type === 'local');
    const mcpTools = this.availableTools.filter(t => t.type === 'mcp');
    
    let prompt = `=== Available Tools ===\n\n`;
    
    if (localTools.length > 0) {
      prompt += `**Local Tools:**\n`;
      localTools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      });
      prompt += `\n`;
    }
    
    if (mcpTools.length > 0) {
      prompt += `**MCP Tools:**\n`;
      mcpTools.forEach(tool => {
        prompt += `- ${tool.name}: ${tool.description}\n`;
      });
      prompt += `\n`;
    }
    
    prompt += `使用方式：当需要使用工具时，请在回复中包含JSON格式：\n`;
    prompt += `{"use_tool": true, "tool_type": "local|mcp", "tool_name": "工具名", "parameters": {...}, "requires_approval": true/false}\n\n`;
    prompt += `安全操作(查询、搜索): requires_approval: false\n`;
    prompt += `危险操作(创建、删除、修改): requires_approval: true`;
    
    return prompt;
  }

  /**
   * 从AI回复内容中解析工具调用
   */
  parseToolCallsFromContent(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // 查找JSON格式的工具调用
    const jsonPattern = /\{[^}]*"use_tool"\s*:\s*true[^}]*\}/g;
    const matches = content.match(jsonPattern);
    
    if (!matches) return toolCalls;

    for (const match of matches) {
      try {
        const parsed = JSON.parse(match);
        
        if (parsed.use_tool === true && parsed.tool_name) {
          const toolCall: ToolCall = {
            tool_type: parsed.tool_type || 'local',
            tool_name: parsed.tool_name,
            parameters: parsed.parameters || {},
            requires_approval: this.shouldRequireApproval(parsed.tool_name, parsed.requires_approval)
          };
          
          toolCalls.push(toolCall);
        }
      } catch (error) {
        console.warn('Failed to parse tool call JSON:', match, error);
      }
    }
    
    return toolCalls;
  }

  /**
   * 判断工具是否需要approval
   */
  private shouldRequireApproval(toolName: string, explicitApproval?: boolean): boolean {
    // 如果显式指定了approval，使用指定值
    if (typeof explicitApproval === 'boolean') {
      return explicitApproval;
    }
    
    // 根据工具信息判断
    const tool = this.availableTools.find(t => t.name === toolName);
    if (tool) {
      return tool.requires_approval;
    }
    
    // 默认危险操作
    const dangerousTools = [
      'create_file', 'update_file', 'delete_file', 
      'append_file', 'execute_command'
    ];
    
    return dangerousTools.includes(toolName);
  }

  /**
   * 增强系统消息
   */
  enhanceSystemMessage(messages: any[]): any[] {
    const toolsPrompt = this.generateSystemPrompt();
    const enhancedMessages = [...messages];
    
    // 查找现有的系统消息
    const systemMessageIndex = enhancedMessages.findIndex(msg => msg.role === 'system');
    
    if (systemMessageIndex >= 0) {
      // 追加到现有系统消息
      enhancedMessages[systemMessageIndex] = {
        ...enhancedMessages[systemMessageIndex],
        content: `${enhancedMessages[systemMessageIndex].content}\n\n${toolsPrompt}`
      };
    } else {
      // 创建新的系统消息
      enhancedMessages.unshift({
        role: 'system',
        content: `你是一个AI助手。\n\n${toolsPrompt}`
      });
    }
    
    return enhancedMessages;
  }

  /**
   * 将ToolCall转换为Parameter格式（用于后端API）
   */
  convertToolCallToParameters(toolCall: ToolCall): Parameter[] {
    const parameters: Parameter[] = [];
    
    for (const [key, value] of Object.entries(toolCall.parameters)) {
      parameters.push({
        name: key,
        description: '', // 执行时不需要description
        required: true,  // 执行时不需要required
        value: String(value)
      });
    }
    
    return parameters;
  }
}

// 导出单例
export const toolParser = new ToolParser();
