import { useState, useEffect, useCallback } from 'react';
import { serviceFactory } from '../services/ServiceFactory';

const SELECTED_MODEL_LS_KEY = 'copilot_selected_model_id';

export const useModels = () => {
    const [models, setModels] = useState<string[]>([]);
    const [selectedModel, setSelectedModelState] = useState<string | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchModels = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const availableModels = await serviceFactory.getModels();
            setModels(availableModels);

            const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
            if (storedModelId && availableModels.includes(storedModelId)) {
                setSelectedModelState(storedModelId);
            } else if (availableModels.length > 0) {
                // 严格模式：使用第一个可用模型，不使用硬编码回退
                setSelectedModelState(availableModels[0]);
                localStorage.setItem(SELECTED_MODEL_LS_KEY, availableModels[0]);
            } else {
                // 没有模型时设置错误状态，但不抛出异常
                setError("没有可用的模型选项");
                console.warn("No models available from service");
            }
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            setError(errorMessage);
            console.error('Failed to fetch models:', err);
            // 获取模型失败时，尝试从localStorage加载
            const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
            if (storedModelId) {
                setSelectedModelState(storedModelId);
                // 如果模型列表为空，至少显示存储的模型
                if (models.length === 0) {
                    setModels([storedModelId]);
                }
                // 清除错误状态，因为我们有缓存的模型
                setError(null);
            } else {
                // 没有存储模型且获取失败时，设置默认模型避免崩溃
                const fallbackModels = ['gpt-4.1', 'gpt-4', 'gpt-3.5-turbo'];
                setModels(fallbackModels);
                setSelectedModelState(fallbackModels[0]);
                localStorage.setItem(SELECTED_MODEL_LS_KEY, fallbackModels[0]);
                console.warn('Using fallback models due to service unavailability');
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
