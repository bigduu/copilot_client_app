import { useState, useEffect } from 'react';
import { useServiceMode } from './useServiceMode';

interface ServiceHealth {
  isHealthy: boolean;
  error?: string;
  lastChecked?: Date;
}

export const useServiceHealth = () => {
  const [health, setHealth] = useState<ServiceHealth>({ isHealthy: true });
  const [isChecking, setIsChecking] = useState(false);
  const { serviceMode } = useServiceMode();

  const checkHealth = async () => {
    if (serviceMode === 'tauri') {
      // Tauri mode is always considered healthy since it's native
      setHealth({ isHealthy: true, lastChecked: new Date() });
      return;
    }

    setIsChecking(true);
    try {
      // Check if the web service is responding
      const response = await fetch('http://localhost:8080/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        setHealth({ isHealthy: true, lastChecked: new Date() });
      } else {
        setHealth({
          isHealthy: false,
          error: `Service responded with status ${response.status}`,
          lastChecked: new Date(),
        });
      }
    } catch (error) {
      setHealth({
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastChecked: new Date(),
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();
    
    // Check health every 30 seconds when in OpenAI mode
    if (serviceMode === 'openai') {
      const interval = setInterval(checkHealth, 30000);
      return () => clearInterval(interval);
    }
  }, [serviceMode]);

  return {
    health,
    isChecking,
    checkHealth,
  };
};
