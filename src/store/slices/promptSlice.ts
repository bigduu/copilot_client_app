import { StateCreator } from "zustand";
import { UserSystemPrompt } from "../../types/chat";
import { SystemPromptService } from "../../services/SystemPromptService";
import type { AppState } from "../";

const LAST_SELECTED_PROMPT_ID_LS_KEY = "copilot_last_selected_prompt_id";
const systemPromptService = SystemPromptService.getInstance();

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
  set
) => ({
  // Initial state
  systemPrompts: [],
  lastSelectedPromptId:
    localStorage.getItem(LAST_SELECTED_PROMPT_ID_LS_KEY) || null,

  // System prompt management
  loadSystemPrompts: async () => {
    try {
      const presets = await systemPromptService.getSystemPromptPresets();
      const prompts: UserSystemPrompt[] = presets.map((p: any) => ({
        id: p.id,
        name: p.name,
        content: p.content,
        description: p.description,
        isDefault: Boolean(p.isDefault),
      }));
      set({ systemPrompts: prompts });
      console.log("Loaded system prompts from backend:", prompts);
    } catch (error) {
      console.error("Failed to load system prompts from backend:", error);
      set({ systemPrompts: [] });
    }
  },

  addSystemPrompt: async (_promptData) => {
    console.warn("addSystemPrompt is deprecated; prompts are managed by backend categories");
  },

  updateSystemPrompt: async (_promptToUpdate) => {
    console.warn("updateSystemPrompt is deprecated; prompts are managed by backend categories");
  },

  deleteSystemPrompt: async (_promptId) => {
    console.warn("deleteSystemPrompt is deprecated; prompts are managed by backend categories");
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
