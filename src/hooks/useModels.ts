import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const useModels = () => {
    const [models, setModels] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchModels = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const availableModels = await invoke<string[]>('get_models');
            setModels(availableModels);
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            console.error('Failed to fetch models:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchModels();
    }, []);

    return {
        models,
        isLoading,
        error,
        refreshModels: fetchModels
    };
}; 