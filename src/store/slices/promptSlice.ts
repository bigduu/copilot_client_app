import { StateCreator } from 'zustand';
import { SystemPromptPreset } from '../../types/chat';
import type { AppState } from '../';

const LAST_SELECTED_PROMPT_ID_LS_KEY = 'copilot_last_selected_prompt_id';

export interface PromptSlice {
  // State
  systemPromptPresets: SystemPromptPreset[];
  lastSelectedPromptId: string | null;

  // Actions
  loadSystemPromptPresets: () => Promise<void>;
  setSystemPromptPresets: (presets: SystemPromptPreset[]) => void;
  setLastSelectedPromptId: (promptId: string) => void;
}

export const createPromptSlice: StateCreator<AppState, [], [], PromptSlice> = (set) => ({
  // Initial state
  systemPromptPresets: [],
  lastSelectedPromptId: localStorage.getItem(LAST_SELECTED_PROMPT_ID_LS_KEY) || null,

  // System prompt presets management
  loadSystemPromptPresets: async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const categories = await invoke<any[]>('get_tool_categories');

      const presets: SystemPromptPreset[] = categories.map((category) => ({
        id: category.id,
        name: category.display_name || category.name,
        content: category.system_prompt,
        description: category.description,
        category: category.id,
        mode: category.restrict_conversation ? 'tool_specific' : 'general',
        autoToolPrefix: category.auto_prefix,
        allowedTools: category.tools || [],
        restrictConversation: category.restrict_conversation || false,
      }));

      set(state => ({ ...state, systemPromptPresets: presets }));
      console.log('Successfully loaded system prompt presets from backend:', presets);
    } catch (error) {
      console.error('Failed to load system prompt presets from backend:', error);
      set(state => ({ ...state, systemPromptPresets: [] }));
    }
  },

  setSystemPromptPresets: (presets) => {
    set(state => ({ ...state, systemPromptPresets: presets }));
  },

  setLastSelectedPromptId: (promptId: string) => {
    set(state => ({ ...state, lastSelectedPromptId: promptId }));
    try {
      localStorage.setItem(LAST_SELECTED_PROMPT_ID_LS_KEY, promptId);
    } catch (error) {
      console.error('Failed to save last selected prompt ID to localStorage:', error);
    }
  },
});