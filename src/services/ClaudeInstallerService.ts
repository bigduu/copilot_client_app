import { buildBackendUrl } from "../utils/backendBaseUrl";

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
    const response = await fetch(buildBackendUrl("/claude/install/settings"));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async updateSettings(settings: InstallerSettings): Promise<InstallerSettings> {
    const response = await fetch(buildBackendUrl("/claude/install/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  }

  async detectNpm(): Promise<NpmDetectResponse> {
    const response = await fetch(buildBackendUrl("/claude/install/npm/detect"));
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
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
    const response = await fetch(buildBackendUrl("/claude/install/npm/install"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        scope: options.scope,
        package: options.package,
        project_path: options.projectPath,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP error! status: ${response.status}`);
    }

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
