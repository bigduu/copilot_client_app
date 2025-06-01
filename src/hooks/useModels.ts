import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const SELECTED_MODEL_LS_KEY = 'copilot_selected_model_id';
const FALLBACK_MODEL = 'gpt-4o'; // As seen in SystemSettingsModal

export const useModels = () => {
    const [models, setModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModelState] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const availableModels = await invoke<string[]>('get_models');
            setModels(availableModels);

            const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
            if (storedModelId && availableModels.includes(storedModelId)) {
                setSelectedModelState(storedModelId);
            } else if (availableModels.length > 0) {
                // If stored model is invalid or not present, check if fallback is available
                if (availableModels.includes(FALLBACK_MODEL)) {
                    setSelectedModelState(FALLBACK_MODEL);
                    localStorage.setItem(SELECTED_MODEL_LS_KEY, FALLBACK_MODEL);
                } else {
                    // Otherwise, use the first available model
                    setSelectedModelState(availableModels[0]);
                    localStorage.setItem(SELECTED_MODEL_LS_KEY, availableModels[0]);
                }
            } else {
                // No models available, but set fallback so UI shows something
                setSelectedModelState(FALLBACK_MODEL);
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            console.error('Failed to fetch models:', err);
            // Attempt to load from localStorage even if fetch fails, or use fallback
            const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
            if (storedModelId) {
                setSelectedModelState(storedModelId);
            } else {
                setSelectedModelState(FALLBACK_MODEL);
            }
            // If models array is empty from a previous successful fetch, set it to at least the fallback
            // or the stored model, so the dropdown isn't empty.
            if (models.length === 0) {
                setModels(storedModelId ? [storedModelId] : [FALLBACK_MODEL]);
            }
        } finally {
            setIsLoading(false);
        }
    }, [models.length]); // models.length dependency to re-evaluate if models becomes empty

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);

    const setSelectedModel = useCallback((modelId: string) => {
        setSelectedModelState(modelId);
        localStorage.setItem(SELECTED_MODEL_LS_KEY, modelId);
    }, []);

    return {
        models,
        selectedModel,
        setSelectedModel,
        isLoading,
        error,
        refreshModels: fetchModels,
    };
};
