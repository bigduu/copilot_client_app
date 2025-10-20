import { StateCreator } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { UserSystemPrompt } from "../../types/chat";
import { StorageService } from "../../services/StorageService";
import type { AppState } from "../";

const LAST_SELECTED_PROMPT_ID_LS_KEY = "copilot_last_selected_prompt_id";
const storageService = new StorageService();

export interface PromptSlice {
  // State
  systemPrompts: UserSystemPrompt[];
  lastSelectedPromptId: string | null;

  // Actions
  loadSystemPrompts: () => Promise<void>;
  addSystemPrompt: (prompt: Omit<UserSystemPrompt, "id">) => Promise<void>;
  updateSystemPrompt: (prompt: UserSystemPrompt) => Promise<void>;
  deleteSystemPrompt: (promptId: string) => Promise<void>;
  setLastSelectedPromptId: (promptId: string) => void;
}

export const createPromptSlice: StateCreator<AppState, [], [], PromptSlice> = (
  set,
  get
) => ({
  // Initial state
  systemPrompts: [],
  lastSelectedPromptId:
    localStorage.getItem(LAST_SELECTED_PROMPT_ID_LS_KEY) || null,

  // System prompt management
  loadSystemPrompts: async () => {
    try {
      const prompts = await storageService.getSystemPrompts();
      // If no prompts are in storage (e.g., first run), you might want to add a default one.
      if (prompts.length === 0) {
        const defaultPrompt: UserSystemPrompt = {
          id: "default-general",
          name: "General Assistant",
          content: "You are a helpful assistant.",
          isDefault: true,
        };
        prompts.push(defaultPrompt);
        await storageService.saveSystemPrompts(prompts);
      }
      set({ systemPrompts: prompts });
      console.log("Successfully loaded system prompts from storage:", prompts);
    } catch (error) {
      console.error("Failed to load system prompts from storage:", error);
      set({ systemPrompts: [] });
    }
  },

  addSystemPrompt: async (promptData) => {
    const newPrompt: UserSystemPrompt = { ...promptData, id: uuidv4() };
    const currentPrompts = get().systemPrompts;
    const updatedPrompts = [...currentPrompts, newPrompt];
    await storageService.saveSystemPrompts(updatedPrompts);
    set({ systemPrompts: updatedPrompts });
  },

  updateSystemPrompt: async (promptToUpdate) => {
    const currentPrompts = get().systemPrompts;
    const updatedPrompts = currentPrompts.map((p) =>
      p.id === promptToUpdate.id ? promptToUpdate : p
    );
    await storageService.saveSystemPrompts(updatedPrompts);
    set({ systemPrompts: updatedPrompts });
  },

  deleteSystemPrompt: async (promptId) => {
    const currentPrompts = get().systemPrompts;
    const updatedPrompts = currentPrompts.filter((p) => p.id !== promptId);
    await storageService.saveSystemPrompts(updatedPrompts);
    set({ systemPrompts: updatedPrompts });
  },

  setLastSelectedPromptId: (promptId: string) => {
    set({ lastSelectedPromptId: promptId });
    try {
      localStorage.setItem(LAST_SELECTED_PROMPT_ID_LS_KEY, promptId);
    } catch (error) {
      console.error(
        "Failed to save last selected prompt ID to localStorage:",
        error
      );
    }
  },
});
