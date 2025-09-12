import { useEffect } from 'react';
import { useAppStore } from '../store';

export const useModels = () => {
  // 从全局 Zustand store 中选择模型相关的状态
  const models = useAppStore(state => state.models);
  const selectedModel = useAppStore(state => state.selectedModel);
  const isLoading = useAppStore(state => state.isLoadingModels);
  const error = useAppStore(state => state.modelsError);

  // 从 store 中获取 actions
  const fetchModels = useAppStore(state => state.fetchModels);
  const setSelectedModel = useAppStore(state => state.setSelectedModel);

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