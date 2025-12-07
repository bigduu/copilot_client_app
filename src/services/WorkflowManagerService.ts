/**
 * WorkflowManagerService handles markdown-based workflow CRUD operations
 */

export interface WorkflowMetadata {
  name: string;
  filename: string;
  source: 'global' | 'workspace';
  created_at?: string;
  modified_at?: string;
  size: number;
}

export interface WorkflowContent {
  name: string;
  content: string;
  metadata: WorkflowMetadata;
}

export interface CreateWorkflowRequest {
  name: string;
  content: string;
  source: 'global' | 'workspace';
  workspace_path?: string;
}

export interface UpdateWorkflowRequest {
  content: string;
  workspace_path?: string;
}

export interface DeleteWorkflowRequest {
  source: 'global' | 'workspace';
  workspace_path?: string;
}

/**
 * Service for managing markdown-based workflows
 */
export class WorkflowManagerService {
  private static instance: WorkflowManagerService;
  private readonly baseUrl: string = 'http://127.0.0.1:8080/v1';

  private constructor() {}

  static getInstance(): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService();
    }
    return WorkflowManagerService.instance;
  }

  /**
   * List all workflows (global + workspace)
   */
  async listWorkflows(workspacePath?: string): Promise<WorkflowMetadata[]> {
    try {
      console.log('[WorkflowManagerService] Listing workflows', { workspacePath });
      
      const params = new URLSearchParams();
      if (workspacePath) {
        params.append('workspace_path', workspacePath);
      }

      const url = `${this.baseUrl}/workflow-manager${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[WorkflowManagerService] Listed workflows:', data);

      return data.workflows || [];
    } catch (error) {
      console.error('[WorkflowManagerService] Failed to list workflows:', error);
      throw error;
    }
  }

  /**
   * Get a specific workflow by name
   */
  async getWorkflow(name: string, workspacePath?: string): Promise<WorkflowContent> {
    try {
      console.log(`[WorkflowManagerService] Getting workflow: ${name}`, { workspacePath });

      const params = new URLSearchParams();
      if (workspacePath) {
        params.append('workspace_path', workspacePath);
      }

      const url = `${this.baseUrl}/workflow-manager/${encodeURIComponent(name)}${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Workflow '${name}' not found`);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[WorkflowManagerService] Got workflow:`, data);
      return data;
    } catch (error) {
      console.error(`[WorkflowManagerService] Failed to get workflow '${name}':`, error);
      throw error;
    }
  }

  /**
   * Create a new workflow
   */
  async createWorkflow(request: CreateWorkflowRequest): Promise<void> {
    try {
      console.log('[WorkflowManagerService] Creating workflow:', request);

      const response = await fetch(`${this.baseUrl}/workflow-manager`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      console.log('[WorkflowManagerService] Workflow created successfully');
    } catch (error) {
      console.error('[WorkflowManagerService] Failed to create workflow:', error);
      throw error;
    }
  }

  /**
   * Update an existing workflow
   */
  async updateWorkflow(name: string, request: UpdateWorkflowRequest): Promise<void> {
    try {
      console.log(`[WorkflowManagerService] Updating workflow: ${name}`, request);

      const response = await fetch(`${this.baseUrl}/workflow-manager/${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      console.log('[WorkflowManagerService] Workflow updated successfully');
    } catch (error) {
      console.error(`[WorkflowManagerService] Failed to update workflow '${name}':`, error);
      throw error;
    }
  }

  /**
   * Delete a workflow
   */
  async deleteWorkflow(name: string, request: DeleteWorkflowRequest): Promise<void> {
    try {
      console.log(`[WorkflowManagerService] Deleting workflow: ${name}`, request);

      const response = await fetch(`${this.baseUrl}/workflow-manager/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP error! status: ${response.status}`);
      }

      console.log('[WorkflowManagerService] Workflow deleted successfully');
    } catch (error) {
      console.error(`[WorkflowManagerService] Failed to delete workflow '${name}':`, error);
      throw error;
    }
  }
}
