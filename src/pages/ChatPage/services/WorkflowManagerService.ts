import { apiClient, isApiError } from "../../../services/api";

export interface WorkflowMetadata {
  name: string;
  filename: string;
  source: "global" | "workspace";
  modified_at?: string;
  size: number;
}

export interface WorkflowContent {
  name: string;
  content: string;
  metadata?: WorkflowMetadata;
}

/**
 * Service for reading markdown-based workflows
 */
export class WorkflowManagerService {
  private static instance: WorkflowManagerService;

  private constructor() {}

  static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  async listWorkflows(): Promise<WorkflowMetadata[]> {
    try {
      console.log("[WorkflowManagerService] Listing workflows");
      const data = await apiClient.get<unknown[]>("bamboo/workflows");
      const workflows = Array.isArray(data) ? data : [];
      console.log("[WorkflowManagerService] Listed workflows:", workflows);

      return workflows.map((workflow: any) => ({
        name: String(workflow.name || ""),
        filename: String(
          workflow.filename || ((workflow.name || "workflow") + ".md"),
        ),
        size: Number(workflow.size || 0),
        modified_at: workflow.modified_at,
        source: "global",
      }));
    } catch (error) {
      console.error(
        "[WorkflowManagerService] Failed to list workflows:",
        error,
      );
      throw error;
    }
  }

  async getWorkflow(name: string): Promise<WorkflowContent> {
    try {
      console.log("[WorkflowManagerService] Getting workflow: " + name);
      const data = await apiClient.get<{
        name?: string;
        filename?: string;
        size?: number;
        modified_at?: string;
        content?: string;
      }>("bamboo/workflows/" + encodeURIComponent(name));

      const resolvedName = data?.name ? String(data.name) : name;
      const metadata: WorkflowMetadata = {
        name: resolvedName,
        filename: String(data?.filename || (resolvedName + ".md")),
        size: Number(data?.size || 0),
        modified_at: data?.modified_at,
        source: "global",
      };
      console.log("[WorkflowManagerService] Got workflow:", data);
      return {
        name: resolvedName,
        content: String(data?.content || ""),
        metadata,
      };
    } catch (error) {
      console.error(
        "[WorkflowManagerService] Failed to get workflow " + name + ":",
        error,
      );

      // Preserve prior behavior for missing workflows after apiClient unification.
      if (isApiError(error) && error.status === 404) {
        throw new Error("Workflow '" + name + "' not found");
      }

      if (error instanceof Error && error.message.includes("404")) {
        throw new Error("Workflow '" + name + "' not found");
      }

      throw error;
    }
  }
}
