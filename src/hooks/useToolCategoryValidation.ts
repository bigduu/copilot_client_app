import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ToolCategoryInfo, ToolCategoryService, MessageValidationResult } from '../types/toolCategory';

/**
 * 工具类别验证的 React Hook
 */
export function useToolCategoryValidation(currentChatToolCategory?: string) {
  const [currentCategoryInfo, setCurrentCategoryInfo] = useState<ToolCategoryInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const toolCategoryService = ToolCategoryService.getInstance();

  /**
   * 根据类别ID获取类别信息
   */
  const loadCategoryInfo = useCallback(async (categoryId: string) => {
    if (!categoryId) {
      setCurrentCategoryInfo(null);
      return;
    }

    setIsLoading(true);
    try {
      // 调用后端API获取工具类别信息
      const categoryInfo = await invoke<ToolCategoryInfo>('get_tool_category_info', { 
        categoryId 
      });
      setCurrentCategoryInfo(categoryInfo);
    } catch (error) {
      console.error('Failed to load tool category info:', error);
      setCurrentCategoryInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 验证消息是否符合当前类别的严格模式要求
   */
  const validateMessage = useCallback((message: string): MessageValidationResult => {
    return toolCategoryService.validateMessageForStrictMode(message, currentCategoryInfo);
  }, [currentCategoryInfo, toolCategoryService]);

  /**
   * 检查当前是否为严格模式
   */
  const isStrictMode = useCallback((): boolean => {
    return currentCategoryInfo?.strict_tools_mode === true;
  }, [currentCategoryInfo]);

  /**
   * 获取严格模式的输入提示
   */
  const getStrictModePlaceholder = useCallback((): string | null => {
    if (!currentCategoryInfo || !currentCategoryInfo.strict_tools_mode) {
      return null;
    }
    return toolCategoryService.getStrictModePlaceholder(currentCategoryInfo);
  }, [currentCategoryInfo, toolCategoryService]);

  /**
   * 获取严格模式的错误提示
   */
  const getStrictModeErrorMessage = useCallback((): string | null => {
    if (!currentCategoryInfo || !currentCategoryInfo.strict_tools_mode) {
      return null;
    }
    return toolCategoryService.getStrictModeErrorMessage(currentCategoryInfo);
  }, [currentCategoryInfo, toolCategoryService]);

  /**
   * 当聊天的工具类别改变时，重新加载类别信息
   */
  useEffect(() => {
    if (currentChatToolCategory) {
      loadCategoryInfo(currentChatToolCategory);
    } else {
      setCurrentCategoryInfo(null);
    }
  }, [currentChatToolCategory, loadCategoryInfo]);

  return {
    currentCategoryInfo,
    isLoading,
    validateMessage,
    isStrictMode,
    getStrictModePlaceholder,
    getStrictModeErrorMessage,
    loadCategoryInfo,
  };
}