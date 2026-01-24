import { serviceFactory } from "./ServiceFactory";
import type {
  ClaudeEnvVar,
  ClaudeExecuteParams,
  ClaudeMdFile,
  ClaudeProject,
  ClaudeResumeParams,
  ClaudeSession,
} from "./claudeCodeTypes";

export class ClaudeCodeService {
  private static instance: ClaudeCodeService;

  private constructor() {}

  static getInstance(): ClaudeCodeService {
    if (!ClaudeCodeService.instance) {
      ClaudeCodeService.instance = new ClaudeCodeService();
    }
    return ClaudeCodeService.instance;
  }

  async listProjects(): Promise<ClaudeProject[]> {
    return serviceFactory.invoke<ClaudeProject[]>("list_projects");
  }

  async listProjectSessions(projectId: string): Promise<ClaudeSession[]> {
    return serviceFactory.invoke<ClaudeSession[]>("get_project_sessions", {
      projectId,
    });
  }

  async createProject(path: string): Promise<ClaudeProject> {
    return serviceFactory.invoke<ClaudeProject>("create_project", { path });
  }

  async loadSessionHistory(
    projectId: string,
    sessionId: string,
  ): Promise<any[]> {
    return serviceFactory.invoke<any[]>("load_session_history", {
      sessionId,
      projectId,
    });
  }

  async getSessionJsonl(projectId: string, sessionId: string): Promise<any[]> {
    return this.loadSessionHistory(projectId, sessionId);
  }

  async execute(params: ClaudeExecuteParams): Promise<void> {
    await serviceFactory.invoke("execute_claude_code", {
      projectPath: params.projectPath,
      prompt: params.prompt,
      model: params.model,
    });
  }

  async continue(params: ClaudeExecuteParams): Promise<void> {
    await serviceFactory.invoke("continue_claude_code", {
      projectPath: params.projectPath,
      prompt: params.prompt,
      model: params.model,
    });
  }

  async resume(params: ClaudeResumeParams): Promise<void> {
    await serviceFactory.invoke("resume_claude_code", {
      projectPath: params.projectPath,
      sessionId: params.sessionId,
      prompt: params.prompt,
      model: params.model,
    });
  }

  async cancel(sessionId?: string): Promise<void> {
    await serviceFactory.invoke("cancel_claude_execution", { sessionId });
  }

  async listRunningSessions(): Promise<any[]> {
    return serviceFactory.invoke("list_running_claude_sessions");
  }

  async getSessionOutput(sessionId: string): Promise<string> {
    return serviceFactory.invoke("get_claude_session_output", { sessionId });
  }

  async getClaudeBinaryPath(): Promise<string | null> {
    return serviceFactory.invoke("get_claude_binary_path");
  }

  async setClaudeBinaryPath(path: string): Promise<void> {
    await serviceFactory.invoke("set_claude_binary_path", { path });
  }

  async listClaudeInstallations(): Promise<any[]> {
    return serviceFactory.invoke("list_claude_installations");
  }

  async getClaudeEnvVars(): Promise<ClaudeEnvVar[]> {
    return serviceFactory.invoke<ClaudeEnvVar[]>("get_claude_env_vars");
  }

  async findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
    return serviceFactory.invoke<ClaudeMdFile[]>("find_claude_md_files", {
      projectPath,
    });
  }

  async readClaudeMdFile(filePath: string): Promise<string> {
    return serviceFactory.invoke<string>("read_claude_md_file", { filePath });
  }

  async saveClaudeMdFile(filePath: string, content: string): Promise<string> {
    return serviceFactory.invoke<string>("save_claude_md_file", {
      filePath,
      content,
    });
  }

  async listCheckpoints(
    sessionId: string,
    projectId: string,
    projectPath: string,
  ): Promise<any[]> {
    return serviceFactory.invoke("list_checkpoints", {
      sessionId,
      projectId,
      projectPath,
    });
  }

  async createCheckpoint(
    sessionId: string,
    projectId: string,
    projectPath: string,
    description?: string,
  ): Promise<any> {
    return serviceFactory.invoke("create_checkpoint", {
      sessionId,
      projectId,
      projectPath,
      description,
    });
  }

  async restoreCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string,
  ): Promise<any> {
    return serviceFactory.invoke("restore_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
    });
  }

  async forkFromCheckpoint(
    checkpointId: string,
    sessionId: string,
    projectId: string,
    projectPath: string,
    newSessionName: string,
    description?: string,
  ): Promise<any> {
    return serviceFactory.invoke("fork_from_checkpoint", {
      checkpointId,
      sessionId,
      projectId,
      projectPath,
      newSessionName,
      description,
    });
  }

  async getSessionTimeline(
    sessionId: string,
    projectId: string,
    projectPath: string,
  ): Promise<any> {
    return serviceFactory.invoke("get_session_timeline", {
      sessionId,
      projectId,
      projectPath,
    });
  }

  async getCheckpointDiff(
    fromCheckpointId: string,
    toCheckpointId: string,
    sessionId: string,
    projectId: string,
  ): Promise<any> {
    return serviceFactory.invoke("get_checkpoint_diff", {
      fromCheckpointId,
      toCheckpointId,
      sessionId,
      projectId,
    });
  }

  async getCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string,
  ): Promise<any> {
    return serviceFactory.invoke("get_checkpoint_settings", {
      sessionId,
      projectId,
      projectPath,
    });
  }

  async updateCheckpointSettings(
    sessionId: string,
    projectId: string,
    projectPath: string,
    autoCheckpointEnabled: boolean,
    checkpointStrategy: string,
  ): Promise<any> {
    return serviceFactory.invoke("update_checkpoint_settings", {
      sessionId,
      projectId,
      projectPath,
      autoCheckpointEnabled,
      checkpointStrategy,
    });
  }

  async getHooksConfig(scope: string, projectPath?: string): Promise<any> {
    return serviceFactory.invoke("get_hooks_config", { scope, projectPath });
  }

  async updateHooksConfig(
    scope: string,
    hooks: any,
    projectPath?: string,
  ): Promise<any> {
    return serviceFactory.invoke("update_hooks_config", {
      scope,
      hooks,
      projectPath,
    });
  }

  async slashCommandsList(projectPath?: string): Promise<any[]> {
    return serviceFactory.invoke("slash_commands_list", { projectPath });
  }

  async slashCommandGet(commandId: string): Promise<any> {
    return serviceFactory.invoke("slash_command_get", { commandId });
  }

  async slashCommandSave(params: {
    scope: string;
    name: string;
    namespace?: string | null;
    content: string;
    description?: string | null;
    allowedTools?: string[];
    projectPath?: string;
  }): Promise<any> {
    return serviceFactory.invoke("slash_command_save", {
      scope: params.scope,
      name: params.name,
      namespace: params.namespace ?? null,
      content: params.content,
      description: params.description ?? null,
      allowedTools: params.allowedTools ?? [],
      projectPath: params.projectPath,
    });
  }

  async slashCommandDelete(
    commandId: string,
    projectPath?: string,
  ): Promise<any> {
    return serviceFactory.invoke("slash_command_delete", {
      commandId,
      projectPath,
    });
  }
}

export const claudeCodeService = ClaudeCodeService.getInstance();
