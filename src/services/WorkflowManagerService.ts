export interface WorkflowMetadata {
  name: string;
  filename: string;
  source: 'global' | 'workspace';
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
  private readonly baseUrl: string = 'http://127.0.0.1:8080/v1/bodhi';

  private constructor() {}

  static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  async listWorkflows(): Promise<WorkflowMetadata[]> {
    try {
      console.log('[WorkflowManagerService] Listing workflows');
      const response = await fetch(`${this.baseUrl}/workflows`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const workflows = Array.isArray(data) ? data : [];
      console.log('[WorkflowManagerService] Listed workflows:', workflows);

      return workflows.map((workflow: any) => ({
        name: String(workflow.name || ''),
        filename: String(workflow.filename || `${workflow.name || 'workflow'}.md`),
        size: Number(workflow.size || 0),
        modified_at: workflow.modified_at,
        source: 'global',
      }));
    } catch (error) {
      console.error('[WorkflowManagerService] Failed to list workflows:', error);
      throw error;
    }
  }

  async getWorkflow(name: string): Promise<WorkflowContent> {
    try {
      console.log(`[WorkflowManagerService] Getting workflow: ${name}`);
      const response = await fetch(
        `${this.baseUrl}/workflows/${encodeURIComponent(name)}`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Workflow '${name}' not found`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const resolvedName = data?.name ? String(data.name) : name;
      const metadata: WorkflowMetadata = {
        name: resolvedName,
        filename: String(data?.filename || `${resolvedName}.md`),
        size: Number(data?.size || 0),
        modified_at: data?.modified_at,
        source: 'global',
      };
      console.log(`[WorkflowManagerService] Got workflow:`, data);
      return {
        name: resolvedName,
        content: String(data?.content || ''),
        metadata,
      };
    } catch (error) {
      console.error(`[WorkflowManagerService] Failed to get workflow '${name}':`, error);
      throw error;
    }
  }
}
