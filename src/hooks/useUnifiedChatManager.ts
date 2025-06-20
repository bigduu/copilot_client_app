import { useEffect, useRef, useState, useCallback } from 'react';
import { UnifiedChatManager } from '../core/UnifiedChatManager';
import { ChatManagerFactory, ConfigurationScenario } from '../core/ChatManagerFactory';
import {
  ChatState,
  CreateChatOptions,
  UpdateChatOptions,
  CreateMessageOptions,
  UpdateMessageOptions,
  OperationResult
} from '../types/unified-chat';
import { ChatItem } from '../types/chat';

/**
 * React Hook配置选项
 */
export interface UseUnifiedChatManagerOptions {
  scenario?: ConfigurationScenario;
  autoInitialize?: boolean;
  onStateChange?: (state: ChatState) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook返回值类型
 */
export interface UseUnifiedChatManagerReturn {
  // 管理器实例
  manager: UnifiedChatManager | null;
  
  // 状态
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  state: ChatState | null;
  
  // 原子操作方法
  addChat: (options: CreateChatOptions) => Promise<OperationResult<string>>;
  updateChat: (chatId: string, options: UpdateChatOptions) => Promise<OperationResult<void>>;
  deleteChat: (chatId: string) => Promise<void>;
  
  addMessage: (chatId: string, options: CreateMessageOptions) => Promise<OperationResult<string>>;
  updateMessage: (messageId: string, options: UpdateMessageOptions) => Promise<OperationResult<void>>;
  deleteMessage: (messageId: string) => Promise<void>;
  
  // 便利方法
  getCurrentChat: () => ChatItem | null;
  getAllChats: () => ChatItem[];
  getChatMessages: (chatId: string) => any[];
  
  // 生命周期控制
  initialize: () => Promise<void>;
  dispose: () => Promise<void>;
  
  // 状态订阅
  subscribeToState: (callback: (state: ChatState) => void) => () => void;
}

/**
 * UnifiedChatManager的React Hook包装
 * 提供React组件友好的接口和生命周期管理
 */
export function useUnifiedChatManager(
  options: UseUnifiedChatManagerOptions = {}
): UseUnifiedChatManagerReturn {
  const {
    scenario = ConfigurationScenario.DEVELOPMENT,
    autoInitialize = true,
    onStateChange,
    onError
  } = options;

  // 状态管理
  const [manager, setManager] = useState<UnifiedChatManager | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [state, setState] = useState<ChatState | null>(null);

  // 使用ref避免重复创建
  const managerRef = useRef<UnifiedChatManager | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // 错误处理
  const handleError = useCallback((err: Error) => {
    setError(err);
    onError?.(err);
    console.error('UnifiedChatManager Error:', err);
  }, [onError]);

  // 状态变化处理
  const handleStateChange = useCallback((newState: ChatState) => {
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  // 初始化管理器
  const initialize = useCallback(async () => {
    if (managerRef.current || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      // 创建管理器实例
      const newManager = ChatManagerFactory.createForScenario(scenario);
      managerRef.current = newManager;
      setManager(newManager);

      // 订阅状态变化
      unsubscribeRef.current = newManager.stateManager.subscribe(handleStateChange);

      // 初始化管理器
      await newManager.initialize();

      // 获取初始状态
      const initialState = newManager.stateManager.getState();
      setState(initialState);

      setIsInitialized(true);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('初始化失败'));
    } finally {
      setIsLoading(false);
    }
  }, [scenario, isLoading, handleError, handleStateChange]);

  // 清理资源
  const dispose = useCallback(async () => {
    if (!managerRef.current) return;

    try {
      // 取消状态订阅
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // 销毁管理器
      await managerRef.current.dispose();
      managerRef.current = null;
      setManager(null);
      setIsInitialized(false);
      setState(null);
    } catch (err) {
      handleError(err instanceof Error ? err : new Error('清理资源失败'));
    }
  }, [handleError]);

  // 组件挂载时自动初始化
  useEffect(() => {
    if (autoInitialize) {
      initialize();
    }

    // 组件卸载时清理资源
    return () => {
      dispose();
    };
  }, [autoInitialize]); // 移除dispose依赖避免无限循环

  // 原子操作方法
  const addChat = useCallback(async (options: CreateChatOptions) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    return await manager.addChat(options);
  }, [manager]);

  const updateChat = useCallback(async (chatId: string, options: UpdateChatOptions) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    return await manager.updateChat(chatId, options);
  }, [manager]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    await manager.stateManager.deleteChat(chatId);
  }, [manager]);

  const addMessage = useCallback(async (chatId: string, options: CreateMessageOptions) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    return await manager.addMessage(chatId, options);
  }, [manager]);

  const updateMessage = useCallback(async (messageId: string, options: UpdateMessageOptions) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    return await manager.updateMessage(messageId, options);
  }, [manager]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!manager) {
      throw new Error('ChatManager未初始化');
    }
    await manager.stateManager.deleteMessage(messageId);
  }, [manager]);

  // 便利方法
  const getCurrentChat = useCallback(() => {
    if (!state || !state.currentChatId) return null;
    return state.chats.get(state.currentChatId) || null;
  }, [state]);

  const getAllChats = useCallback(() => {
    if (!state) return [];
    return Array.from(state.chats.values());
  }, [state]);

  const getChatMessages = useCallback((chatId: string) => {
    if (!manager) return [];
    return manager.stateManager.getAllMessages(chatId);
  }, [manager]);

  // 状态订阅
  const subscribeToState = useCallback((callback: (state: ChatState) => void) => {
    if (!manager) {
      return () => {};
    }
    return manager.stateManager.subscribe(callback);
  }, [manager]);

  return {
    manager,
    isInitialized,
    isLoading,
    error,
    state,
    addChat,
    updateChat,
    deleteChat,
    addMessage,
    updateMessage,
    deleteMessage,
    getCurrentChat,
    getAllChats,
    getChatMessages,
    initialize,
    dispose,
    subscribeToState
  };
}

/**
 * 便捷Hook - 用于开发环境
 */
export function useDevChatManager(options?: Omit<UseUnifiedChatManagerOptions, 'scenario'>) {
  return useUnifiedChatManager({
    ...options,
    scenario: ConfigurationScenario.DEVELOPMENT
  });
}

/**
 * 便捷Hook - 用于生产环境
 */
export function useProdChatManager(options?: Omit<UseUnifiedChatManagerOptions, 'scenario'>) {
  return useUnifiedChatManager({
    ...options,
    scenario: ConfigurationScenario.PRODUCTION
  });
}

/**
 * 便捷Hook - 用于测试环境
 */
export function useTestChatManager(options?: Omit<UseUnifiedChatManagerOptions, 'scenario'>) {
  return useUnifiedChatManager({
    ...options,
    scenario: ConfigurationScenario.TESTING
  });
}