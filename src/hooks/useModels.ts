import { useEffect } from 'react';
import { useAppStore } from '../store';

export const useModels = () => {
  // Select model-related state from the global Zustand store
  const models = useAppStore(state => state.models);
  const selectedModel = useAppStore(state => state.selectedModel);
  const isLoading = useAppStore(state => state.isLoadingModels);
  const error = useAppStore(state => state.modelsError);

  // Get actions from the store
  const fetchModels = useAppStore(state => state.fetchModels);
  const setSelectedModel = useAppStore(state => state.setSelectedModel);

  // Trigger model loading once when the hook is mounted
  useEffect(() => {
    // Load only when the model list is empty to avoid unnecessary duplicate requests
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
    refreshModels: fetchModels, // Provide refresh functionality
  };
};