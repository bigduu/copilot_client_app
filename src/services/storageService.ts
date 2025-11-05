/**
 * Storage Service - UI Preferences Only
 *
 * This service manages only UI-related preferences and settings.
 * All chat data, messages, and system prompts are managed by the backend Context Manager.
 *
 * @see BackendContextService for chat data management
 */

const STORAGE_KEYS = {
  // UI-only preferences
  THEME: "copilot_ui_theme_v1",
  LAYOUT: "copilot_ui_layout_v1",
};

export class StorageService {
  // =========================
  // UI Preferences
  // =========================

  /**
   * Get the current theme preference (light/dark mode)
   */
  getTheme(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.THEME);
    } catch (error) {
      console.error("Failed to get theme:", error);
      return null;
    }
  }

  /**
   * Set the theme preference (light/dark mode)
   */
  setTheme(theme: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
    } catch (error) {
      console.error("Failed to set theme:", error);
    }
  }

  /**
   * Get the current layout preference (sidebar collapsed state, etc.)
   */
  getLayout(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEYS.LAYOUT);
    } catch (error) {
      console.error("Failed to get layout:", error);
      return null;
    }
  }

  /**
   * Set the layout preference (sidebar collapsed state, etc.)
   */
  setLayout(layout: string): void {
    try {
      localStorage.setItem(STORAGE_KEYS.LAYOUT, layout);
    } catch (error) {
      console.error("Failed to set layout:", error);
    }
  }

  /**
   * Get storage statistics for UI preferences only
   */
  getStorageStats(): {
    estimatedSize: string;
  } {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("copilot_ui_")) {
        const value = localStorage.getItem(key);
        totalSize += (key.length + (value?.length || 0)) * 2;
      }
    }

    return {
      estimatedSize: `${(totalSize / 1024).toFixed(1)} KB`,
    };
  }
}
