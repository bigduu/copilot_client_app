import { SystemPromptPreset, SystemPromptPresetList } from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";

const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_PRESETS_KEY = "system_prompt_presets";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

/**
 * SystemPromptService handles core business logic for system prompts
 * Including CRUD operations and persistence for system prompt presets
 */
export class SystemPromptService {
  private static instance: SystemPromptService;

  static getInstance(): SystemPromptService {
    if (!SystemPromptService.instance) {
      SystemPromptService.instance = new SystemPromptService();
    }
    return SystemPromptService.instance;
  }

  /**
   * Get global system prompt
   */
  getGlobalSystemPrompt(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
    } catch (error) {
      console.error("Error loading global system prompt:", error);
      return DEFAULT_MESSAGE;
    }
  }

  /**
   * Update global system prompt
   */
  updateGlobalSystemPrompt(prompt: string): void {
    try {
      const promptToSave = prompt && prompt.trim() ? prompt : DEFAULT_MESSAGE;
      localStorage.setItem(SYSTEM_PROMPT_KEY, promptToSave);
      console.log("Global system prompt updated successfully");
    } catch (error) {
      console.error("Error saving system prompt:", error);
    }
  }

  /**
   * Load system prompt preset list
   */
  loadSystemPromptPresets(): SystemPromptPresetList {
    try {
      const raw = localStorage.getItem(SYSTEM_PROMPT_PRESETS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.error("Error loading system prompt presets:", error);
    }
    
    // If none exists, initialize with default
    return [
      {
        id: "default",
        name: "Default Assistant",
        content: DEFAULT_MESSAGE,
      },
    ];
  }

  /**
   * Save system prompt preset list
   */
  saveSystemPromptPresets(presets: SystemPromptPresetList): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_PRESETS_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error("Error saving system prompt presets:", error);
    }
  }

  /**
   * Get currently selected preset ID
   */
  getSelectedSystemPromptPresetId(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY) || "default";
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      return "default";
    }
  }

  /**
   * Set currently selected preset ID
   */
  setSelectedSystemPromptPresetId(id: string): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, id);
    } catch (error) {
      console.error("Error saving selected system prompt preset ID:", error);
    }
  }

  /**
   * Add system prompt preset
   */
  addSystemPromptPreset(
    preset: Omit<SystemPromptPreset, "id">,
    currentPresets: SystemPromptPresetList
  ): SystemPromptPresetList {
    const id = crypto.randomUUID();
    const newPreset = { ...preset, id };
    return [...currentPresets, newPreset];
  }

  /**
   * Update system prompt preset
   */
  updateSystemPromptPreset(
    id: string,
    preset: Omit<SystemPromptPreset, "id">,
    currentPresets: SystemPromptPresetList
  ): SystemPromptPresetList {
    return currentPresets.map((p) =>
      p.id === id ? { ...preset, id } : p
    );
  }

  /**
   * Delete system prompt preset
   */
  deleteSystemPromptPreset(
    id: string,
    currentPresets: SystemPromptPresetList,
    selectedPresetId: string
  ): {
    newPresets: SystemPromptPresetList;
    newSelectedId: string;
  } {
    const newPresets = currentPresets.filter((p) => p.id !== id);
    let newSelectedId = selectedPresetId;
    
    // If deleting the currently selected preset, reset to default
    if (selectedPresetId === id) {
      newSelectedId = "default";
    }
    
    return { newPresets, newSelectedId };
  }

  /**
   * Get current system prompt content based on selected preset ID
   */
  getCurrentSystemPromptContent(
    presets: SystemPromptPresetList,
    selectedPresetId: string
  ): string {
    const selectedPreset = presets.find((p) => p.id === selectedPresetId);
    if (selectedPreset) return selectedPreset.content;

    // Fallback to global or default if selected preset not found or content is empty
    return this.getGlobalSystemPrompt();
  }

  /**
   * Find preset by ID
   */
  findPresetById(
    id: string,
    presets: SystemPromptPresetList
  ): SystemPromptPreset | undefined {
    return presets.find((preset) => preset.id === id);
  }

  /**
   * Check if preset name already exists
   */
  presetNameExists(
    name: string,
    presets: SystemPromptPresetList,
    excludeId?: string
  ): boolean {
    return presets.some(
      (preset) => preset.name === name && preset.id !== excludeId
    );
  }

  /**
   * Validate preset data
   */
  validatePreset(preset: Omit<SystemPromptPreset, "id">): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (!preset.name || preset.name.trim().length === 0) {
      errors.push("Preset name cannot be empty");
    }
    
    if (!preset.content || preset.content.trim().length === 0) {
      errors.push("Preset content cannot be empty");
    }
    
    if (preset.name && preset.name.length > 50) {
      errors.push("Preset name cannot exceed 50 characters");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export presets to JSON format
   */
  exportPresetsToJson(presets: SystemPromptPresetList): string {
    try {
      return JSON.stringify(presets, null, 2);
    } catch (error) {
      console.error("Error exporting presets to JSON:", error);
      throw new Error("Failed to export presets");
    }
  }

  /**
   * Import presets from JSON format
   */
  importPresetsFromJson(
    jsonString: string,
    currentPresets: SystemPromptPresetList
  ): {
    success: boolean;
    newPresets?: SystemPromptPresetList;
    error?: string;
  } {
    try {
      const importedPresets = JSON.parse(jsonString) as SystemPromptPresetList;
      
      // Validate imported data format
      if (!Array.isArray(importedPresets)) {
        return { success: false, error: "Imported data format is incorrect" };
      }
      
      // Validate format of each preset
      for (const preset of importedPresets) {
        if (!preset.id || !preset.name || !preset.content) {
          return { success: false, error: "Imported preset data format is incomplete" };
        }
      }
      
      // Merge presets, avoiding ID conflicts
      const mergedPresets = [...currentPresets];
      const existingIds = new Set(currentPresets.map(p => p.id));
      
      importedPresets.forEach(preset => {
        if (!existingIds.has(preset.id)) {
          mergedPresets.push(preset);
        } else {
          // If ID conflicts, generate new ID
          mergedPresets.push({
            ...preset,
            id: crypto.randomUUID(),
            name: `${preset.name} (Imported)`,
          });
        }
      });
      
      return { success: true, newPresets: mergedPresets };
    } catch (error) {
      console.error("Error importing presets from JSON:", error);
      return { success: false, error: "Incorrect JSON format" };
    }
  }
}
