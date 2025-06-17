import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ToolCategoryInfo,
  ToolCategoryService,
  MessageValidationResult,
} from "../types/toolCategory";

/**
 * React Hook for tool category validation
 */
export function useToolCategoryValidation(currentChatToolCategory?: string) {
  const [currentCategoryInfo, setCurrentCategoryInfo] =
    useState<ToolCategoryInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const toolCategoryService = ToolCategoryService.getInstance();

  /**
   * Get category information by category ID
   */
  const loadCategoryInfo = useCallback(async (categoryId: string) => {
    if (!categoryId) {
      setCurrentCategoryInfo(null);
      return;
    }

    setIsLoading(true);
    try {
      // Call backend API to get tool category information
      const categoryInfo = await invoke<ToolCategoryInfo>(
        "get_tool_category_info",
        {
          categoryId,
        }
      );
      setCurrentCategoryInfo(categoryInfo);
    } catch (error) {
      console.error("Failed to load tool category info:", error);
      setCurrentCategoryInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Validate if message meets current category's strict mode requirements
   */
  const validateMessage = useCallback(
    (message: string): MessageValidationResult => {
      return toolCategoryService.validateMessageForStrictMode(
        message,
        currentCategoryInfo
      );
    },
    [currentCategoryInfo, toolCategoryService]
  );

  /**
   * Check if currently in strict mode
   */
  const isStrictMode = useCallback((): boolean => {
    return currentCategoryInfo?.strict_tools_mode === true;
  }, [currentCategoryInfo]);

  /**
   * Get strict mode input placeholder
   */
  const getStrictModePlaceholder = useCallback((): string | null => {
    if (!currentCategoryInfo || !currentCategoryInfo.strict_tools_mode) {
      return null;
    }
    return toolCategoryService.getStrictModePlaceholder(currentCategoryInfo);
  }, [currentCategoryInfo, toolCategoryService]);

  /**
   * Get strict mode error message
   */
  const getStrictModeErrorMessage = useCallback((): string | null => {
    if (!currentCategoryInfo || !currentCategoryInfo.strict_tools_mode) {
      return null;
    }
    return toolCategoryService.getStrictModeErrorMessage(currentCategoryInfo);
  }, [currentCategoryInfo, toolCategoryService]);

  /**
   * Reload category information when chat's tool category changes
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
