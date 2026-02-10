import { apiClient } from "../api";

export type InstallScope = "global" | "project";
export type InstallTarget = "claude_code" | "claude_router";

export interface LastInstalled {
  claude_code?: string | null;
  claude_router?: string | null;
}

export interface InstallerSettings {
  claude_code_package: string;
  claude_router_package: string;
  install_scope: InstallScope;
  last_installed?: LastInstalled | null;
  env_vars?: { key: string; value: string }[];
}

export interface NpmDetectResponse {
  available: boolean;
  path?: string | null;
  version?: string | null;
  error?: string | null;
}

export type InstallEvent =
  | { type: "line"; message: string }
  | { type: "done"; success: boolean; exit_code?: number | null }
  | { type: "error"; message: string };

export class ClaudeInstallerService {
  async getSettings(): Promise<InstallerSettings> {
    return apiClient.get<InstallerSettings>("claude/install/settings");
  }

  async updateSettings(
    settings: InstallerSettings,
  ): Promise<InstallerSettings> {
    return apiClient.post<InstallerSettings>("claude/install/settings", settings);
  }

  async detectNpm(): Promise<NpmDetectResponse> {
    return apiClient.get<NpmDetectResponse>("claude/install/npm/detect");
  }

  async install(
    target: InstallTarget,
    options: {
      scope?: InstallScope;
      package?: string;
      projectPath?: string;
    },
    onEvent?: (event: InstallEvent) => void,
  ): Promise<void> {
    const response = await apiClient.fetchRaw("claude/install/npm/install", {
      method: "POST",
      body: JSON.stringify({
        target,
        scope: options.scope,
        package: options.package,
        project_path: options.projectPath,
      }),
    });

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx = buffer.indexOf("\n\n");
      while (idx !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLines = chunk
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.replace(/^data:\s?/, ""));
        const data = dataLines.join("\n").trim();
        if (data) {
          try {
            const event = JSON.parse(data) as InstallEvent;
            onEvent?.(event);
          } catch {
            onEvent?.({ type: "line", message: data });
          }
        }
        idx = buffer.indexOf("\n\n");
      }
    }
  }
}

export const claudeInstallerService = new ClaudeInstallerService();
