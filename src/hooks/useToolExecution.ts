import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ToolCall, ToolInfo, Parameter, toolParser } from '../utils/toolParser';

export interface ToolExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
}

export interface ToolExecutionState {
  isLoading: boolean;
  availableTools: ToolInfo[];
  executionResults: Record<string, ToolExecutionResult>;
  pendingApprovals: ToolCall[];
}

export const useToolExecution = () => {
  const [state, setState] = useState<ToolExecutionState>({
    isLoading: false,
    availableTools: [],
    executionResults: {},
    pendingApprovals: []
  });

  /**
   * 初始化工具列表
   */
  const initializeTools = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      await toolParser.loadAvailableTools();
      const tools = toolParser.getAvailableTools();
      
      setState(prev => ({
        ...prev,
        availableTools: tools,
        isLoading: false
      }));
    } catch (error) {
      console.error('Failed to initialize tools:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  /**
   * 执行单个工具
   */
  const executeTool = useCallback(async (toolCall: ToolCall): Promise<ToolExecutionResult> => {
    const parameters = toolParser.convertToolCallToParameters(toolCall);
    const command = toolCall.tool_type === 'mcp' ? 'execute_mcp_tool' : 'execute_local_tool';
    
    try {
      const result = await invoke<string>(command, {
        tool_name: toolCall.tool_name,
        parameters: parameters
      });
      
      const executionResult: ToolExecutionResult = {
        success: true,
        result
      };
      
      setState(prev => ({
        ...prev,
        executionResults: {
          ...prev.executionResults,
          [toolCall.tool_name]: executionResult
        }
      }));
      
      return executionResult;
    } catch (error: any) {
      const executionResult: ToolExecutionResult = {
        success: false,
        error: error.message || String(error)
      };
      
      setState(prev => ({
        ...prev,
        executionResults: {
          ...prev.executionResults,
          [toolCall.tool_name]: executionResult
        }
      }));
      
      return executionResult;
    }
  }, []);

  /**
   * 批量执行工具
   */
  const executeToolsBatch = useCallback(async (toolCalls: ToolCall[]): Promise<Record<string, ToolExecutionResult>> => {
    try {
      const results = await invoke<Array<[string, { Ok?: string; Err?: any }]>>('execute_tools_batch', {
        tool_calls: toolCalls
      });
      
      const executionResults: Record<string, ToolExecutionResult> = {};
      
      for (const [toolName, result] of results) {
        if ('Ok' in result) {
          executionResults[toolName] = {
            success: true,
            result: result.Ok
          };
        } else {
          executionResults[toolName] = {
            success: false,
            error: result.Err?.message || String(result.Err)
          };
        }
      }
      
      setState(prev => ({
        ...prev,
        executionResults: {
          ...prev.executionResults,
          ...executionResults
        }
      }));
      
      return executionResults;
    } catch (error: any) {
      console.error('Batch execution failed:', error);
      const errorResult: ToolExecutionResult = {
        success: false,
        error: error.message || String(error)
      };
      
      const results: Record<string, ToolExecutionResult> = {};
      toolCalls.forEach(call => {
        results[call.tool_name] = errorResult;
      });
      
      return results;
    }
  }, []);

  /**
   * 处理AI回复中的工具调用
   */
  const processToolCallsFromContent = useCallback(async (content: string): Promise<{
    autoExecuted: ToolCall[];
    pendingApproval: ToolCall[];
    results: Record<string, ToolExecutionResult>;
  }> => {
    const toolCalls = toolParser.parseToolCallsFromContent(content);
    
    if (toolCalls.length === 0) {
      return {
        autoExecuted: [],
        pendingApproval: [],
        results: {}
      };
    }
    
    // 分类工具调用
    const safeCalls = toolCalls.filter(call => !call.requires_approval);
    const dangerousCalls = toolCalls.filter(call => call.requires_approval);
    
    // 自动执行安全工具
    let results: Record<string, ToolExecutionResult> = {};
    if (safeCalls.length > 0) {
      results = await executeToolsBatch(safeCalls);
    }
    
    // 更新待审批工具
    if (dangerousCalls.length > 0) {
      setState(prev => ({
        ...prev,
        pendingApprovals: [...prev.pendingApprovals, ...dangerousCalls]
      }));
    }
    
    return {
      autoExecuted: safeCalls,
      pendingApproval: dangerousCalls,
      results
    };
  }, [executeToolsBatch]);

  /**
   * 批准并执行待审批的工具
   */
  const approveAndExecuteTools = useCallback(async (toolCalls: ToolCall[]): Promise<Record<string, ToolExecutionResult>> => {
    const results = await executeToolsBatch(toolCalls);
    
    // 从待审批列表中移除已执行的工具
    setState(prev => ({
      ...prev,
      pendingApprovals: prev.pendingApprovals.filter(
        pending => !toolCalls.some(executed => executed.tool_name === pending.tool_name)
      )
    }));
    
    return results;
  }, [executeToolsBatch]);

  /**
   * 拒绝待审批的工具
   */
  const rejectTools = useCallback((toolCalls: ToolCall[]) => {
    setState(prev => ({
      ...prev,
      pendingApprovals: prev.pendingApprovals.filter(
        pending => !toolCalls.some(rejected => rejected.tool_name === pending.tool_name)
      )
    }));
  }, []);

  /**
   * 清除执行结果
   */
  const clearResults = useCallback(() => {
    setState(prev => ({
      ...prev,
      executionResults: {}
    }));
  }, []);

  /**
   * 增强消息的系统提示
   */
  const enhanceSystemMessage = useCallback((messages: any[]) => {
    return toolParser.enhanceSystemMessage(messages);
  }, []);

  return {
    // 状态
    ...state,
    
    // 方法
    initializeTools,
    executeTool,
    executeToolsBatch,
    processToolCallsFromContent,
    approveAndExecuteTools,
    rejectTools,
    clearResults,
    enhanceSystemMessage
  };
};

export default useToolExecution;
