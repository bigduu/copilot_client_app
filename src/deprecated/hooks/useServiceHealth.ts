import { useState, useEffect } from "react";

import { healthService } from "../services/HealthService";

interface ServiceHealth {
  isHealthy: boolean;
  error?: string;
  lastChecked?: Date;
}

/**
 * Hook to check the health of the backend web service
 * Always checks HTTP API (Web mode only)
 */
export const useServiceHealth = () => {
  const [health, setHealth] = useState<ServiceHealth>({ isHealthy: true });
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = async () => {
    setIsChecking(true);
    try {
      const result = await healthService.checkBackendHealth(5000);
      setHealth({
        isHealthy: result.isHealthy,
        error: result.error,
        lastChecked: new Date(),
      });
    } catch (error) {
      setHealth({
        isHealthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
        lastChecked: new Date(),
      });
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkHealth();

    // Check health every 30 seconds
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  return {
    health,
    isChecking,
    checkHealth,
  };
};
