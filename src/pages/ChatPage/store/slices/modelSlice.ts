import { StateCreator } from "zustand";
import {
  modelService,
  ProxyAuthRequiredError,
} from "../../services/ModelService";
import type { AppState } from "../";

const SELECTED_MODEL_LS_KEY = "copilot_selected_model_id";
const FALLBACK_MODELS = ["gpt-5-mini", "gpt-5", "gemini-2.5-pro"];
let fetchModelsInFlight: Promise<void> | null = null;

export interface ModelSlice {
  // Model Management State
  models: string[];
  selectedModel: string | undefined;
  isLoadingModels: boolean;
  modelsError: string | null;

  // Actions
  fetchModels: () => Promise<void>;
  setSelectedModel: (modelId: string) => void;
}

export const createModelSlice: StateCreator<AppState, [], [], ModelSlice> = (
  set,
  get,
) => ({
  // Initial state
  models: [],
  selectedModel: undefined,
  isLoadingModels: false,
  modelsError: null,

  // Model Management Actions
  setSelectedModel: (modelId) => {
    set({ selectedModel: modelId });
    try {
      localStorage.setItem(SELECTED_MODEL_LS_KEY, modelId);
    } catch (error) {
      console.error("Failed to save selected model to localStorage:", error);
    }
  },

  fetchModels: async () => {
    if (fetchModelsInFlight) {
      return fetchModelsInFlight;
    }

    fetchModelsInFlight = (async () => {
      set({ isLoadingModels: true, modelsError: null });
      try {
        const availableModels = await modelService.getModels();
        set((state) => {
          const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
          const currentSelected = state.selectedModel;

          let newSelectedModel = state.selectedModel;

          if (currentSelected && availableModels.includes(currentSelected)) {
            // Current selection is valid, do nothing
          } else if (storedModelId && availableModels.includes(storedModelId)) {
            newSelectedModel = storedModelId;
          } else if (availableModels.length > 0) {
            newSelectedModel = availableModels[0];
            localStorage.setItem(SELECTED_MODEL_LS_KEY, newSelectedModel);
          } else {
            newSelectedModel = undefined; // No models available
          }

          return {
            ...state,
            models: availableModels,
            selectedModel: newSelectedModel,
            modelsError:
              availableModels.length > 0 ? null : "No available model options",
          };
        });

        if (get().models.length === 0) {
          console.warn("No models available from service");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("Failed to fetch models:", err);

        if (err instanceof ProxyAuthRequiredError) {
          set((state) => {
            const fallbackModel =
              state.selectedModel ||
              localStorage.getItem(SELECTED_MODEL_LS_KEY) ||
              FALLBACK_MODELS[0];

            if (!localStorage.getItem(SELECTED_MODEL_LS_KEY)) {
              localStorage.setItem(SELECTED_MODEL_LS_KEY, fallbackModel);
            }

            return {
              ...state,
              models: state.models.length > 0 ? state.models : FALLBACK_MODELS,
              selectedModel: state.selectedModel || fallbackModel,
              modelsError:
                errorMessage ||
                "Proxy authentication required. Please configure proxy auth.",
            };
          });
          return;
        }

        set((state) => {
          const storedModelId = localStorage.getItem(SELECTED_MODEL_LS_KEY);
          if (storedModelId) {
            return {
              ...state,
              models: [storedModelId],
              selectedModel: storedModelId,
              modelsError: errorMessage,
            };
          } else {
            const fallbackModel = FALLBACK_MODELS[0];
            localStorage.setItem(SELECTED_MODEL_LS_KEY, fallbackModel);
            console.warn("Using fallback models due to service unavailability");
            return {
              ...state,
              models: FALLBACK_MODELS,
              selectedModel: fallbackModel,
              modelsError: errorMessage,
            };
          }
        });
      } finally {
        set({ isLoadingModels: false });
      }
    })();

    try {
      await fetchModelsInFlight;
    } finally {
      fetchModelsInFlight = null;
    }
  },
});
