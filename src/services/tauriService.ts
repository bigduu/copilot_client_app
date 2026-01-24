import { invoke } from "@tauri-apps/api/core";

export class TauriUtilityService {
  /**
   * Copy text to clipboard
   */
  async copyToClipboard(text: string): Promise<void> {
    await invoke("copy_to_clipboard", { text });
  }

  /**
   * Generic invoke method for custom commands
   */
  async invoke<T = any>(
    command: string,
    args?: Record<string, any>
  ): Promise<T> {
    return await invoke(command, args);
  }
}
