import { useEffect } from 'react';
import { useChatStore } from '../store/chatStore';

export const useModels = () => {
  // 从全局 Zustand store 中选择模型相关的状态
  const models = useChatStore(state => state.models);
  const selectedModel = useChatStore(state => state.selectedModel);
  const isLoading = useChatStore(state => state.isLoadingModels);
  const error = useChatStore(state => state.modelsError);

  // 从 store 中获取 actions
  const fetchModels = useChatStore(state => state.fetchModels);
  const setSelectedModel = useChatStore(state => state.setSelectedModel);

  // 在 hook 挂载时触发一次模型加载
  useEffect(() => {
    // 只有在模型列表为空时才加载，避免不必要的重复请求
    if (models.length === 0) {
      fetchModels();
    }
  }, [fetchModels, models.length]);

  return {
    models,
    selectedModel,
    setSelectedModel,
    isLoading,
    error,
    refreshModels: fetchModels, // 提供刷新功能
  };
};