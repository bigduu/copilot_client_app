import { useState, useEffect } from "react";
import { ServiceMode } from "../services/types";
import { serviceFactory } from "../services/ServiceFactory";

export const useServiceMode = () => {
  const [serviceMode, setServiceModeState] = useState<ServiceMode>(() => {
    return serviceFactory.getCurrentMode();
  });

  const setServiceMode = (mode: ServiceMode) => {
    serviceFactory.setMode(mode);
    setServiceModeState(mode);
  };

  // Listen for changes in other components/tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "copilot_service_mode" && e.newValue) {
        const newMode = e.newValue as ServiceMode;
        if (newMode !== serviceMode) {
          setServiceModeState(newMode);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [serviceMode]);

  return {
    serviceMode,
    setServiceMode,
    isOpenAIMode: serviceMode === "openai",
    isTauriMode: serviceMode === "tauri",
  };
};
