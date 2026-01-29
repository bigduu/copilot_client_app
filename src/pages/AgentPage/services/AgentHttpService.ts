import { buildBackendUrl } from "../../../shared/utils/backendBaseUrl";
import { ClaudeProject, ClaudeSession, ClaudeSettings, SystemPromptResponse } from "./agentHttpTypes";

export class AgentHttpService {
  async getProjects(): Promise<ClaudeProject[]> {
    const response = await fetch(buildBackendUrl("/agent/projects"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async createProject(path: string): Promise<ClaudeProject> {
    const response = await fetch(buildBackendUrl("/agent/projects"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getProjectSessions(projectId: string): Promise<ClaudeSession[]> {
    const response = await fetch(buildBackendUrl(`/agent/projects/${projectId}/sessions`));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getClaudeSettings(): Promise<ClaudeSettings> {
    const response = await fetch(buildBackendUrl("/agent/settings"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async saveClaudeSettings(settings: any): Promise<void> {
    const response = await fetch(buildBackendUrl("/agent/settings"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  }

  async getSystemPrompt(): Promise<string> {
    const response = await fetch(buildBackendUrl("/agent/system-prompt"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data: SystemPromptResponse = await response.json();
    return data.content;
  }

  async saveSystemPrompt(content: string): Promise<void> {
    const response = await fetch(buildBackendUrl("/agent/system-prompt"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  }

  async listRunningSessions(): Promise<any[]> {
    const response = await fetch(buildBackendUrl("/agent/sessions/running"));
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }

  async getSessionJsonl(projectId: string, sessionId: string): Promise<any[]> {
    const response = await fetch(
      buildBackendUrl(`/agent/sessions/${sessionId}/jsonl?project_id=${projectId}`)
    );
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return response.json();
  }
}

export const agentHttpService = new AgentHttpService();
