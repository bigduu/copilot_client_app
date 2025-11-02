/**
 * WorkflowService handles workflow discovery and execution
 * Workflows are user-invoked actions with explicit parameter forms
 */

export interface WorkflowParameter {
  name: string;
  description: string;
  required: boolean;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  parameters: WorkflowParameter[];
  category: string;
}

export interface WorkflowCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface WorkflowExecutionRequest {
  workflow_name: string;
  parameters: Record<string, any>;
}

export interface WorkflowExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Service for managing workflows (user-invoked actions)
 */
export class WorkflowService {
  private static instance: WorkflowService;
  private readonly baseUrl: string = "http://127.0.0.1:8080/v1";

  private constructor() {}

  static getInstance(): WorkflowService {
    if (!WorkflowService.instance) {
      WorkflowService.instance = new WorkflowService();
    }
    return WorkflowService.instance;
  }

  /**
   * Get all available workflows
   */
  async getAvailableWorkflows(): Promise<WorkflowDefinition[]> {
    try {
      console.log("[WorkflowService] Fetching available workflows");
      const response = await fetch(`${this.baseUrl}/workflows/available`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("[WorkflowService] Fetched workflows:", data);
      
      if (data && Array.isArray(data.workflows)) {
        return data.workflows;
      }
      
      return [];
    } catch (error) {
      console.error("[WorkflowService] Failed to get available workflows:", error);
      throw new Error(`Failed to get available workflows: ${error}`);
    }
  }

  /**
   * Get workflows by category
   */
  async getWorkflowsByCategory(category: string): Promise<WorkflowDefinition[]> {
    try {
      const workflows = await this.getAvailableWorkflows();
      return workflows.filter(w => w.category === category);
    } catch (error) {
      console.error(`[WorkflowService] Failed to get workflows for category ${category}:`, error);
      throw error;
    }
  }

  /**
   * Get all workflow categories
   */
  async getWorkflowCategories(): Promise<string[]> {
    try {
      console.log("[WorkflowService] Fetching workflow categories");
      const response = await fetch(`${this.baseUrl}/workflows/categories`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log("[WorkflowService] Fetched categories:", data);
      
      if (data && Array.isArray(data.categories)) {
        return data.categories;
      }
      
      return [];
    } catch (error) {
      console.error("[WorkflowService] Failed to get workflow categories:", error);
      throw new Error(`Failed to get workflow categories: ${error}`);
    }
  }

  /**
   * Get details of a specific workflow
   */
  async getWorkflowDetails(name: string): Promise<WorkflowDefinition | null> {
    try {
      console.log(`[WorkflowService] Fetching details for workflow: ${name}`);
      const response = await fetch(`${this.baseUrl}/workflows/${name}`);
      
      if (response.status === 404) {
        console.warn(`[WorkflowService] Workflow not found: ${name}`);
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[WorkflowService] Fetched workflow details:`, data);
      return data;
    } catch (error) {
      console.error(`[WorkflowService] Failed to get workflow details for ${name}:`, error);
      throw error;
    }
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    request: WorkflowExecutionRequest
  ): Promise<WorkflowExecutionResult> {
    try {
      console.log("[WorkflowService] Executing workflow:", request);
      const response = await fetch(`${this.baseUrl}/workflows/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }
      
      const result = await response.json();
      console.log("[WorkflowService] Workflow execution result:", result);
      return result;
    } catch (error) {
      console.error("[WorkflowService] Workflow execution failed:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if a workflow exists
   */
  async workflowExists(name: string): Promise<boolean> {
    try {
      const workflows = await this.getAvailableWorkflows();
      return workflows.some(w => w.name === name);
    } catch (error) {
      console.error("[WorkflowService] Failed to check workflow existence:", error);
      return false;
    }
  }

  /**
   * Parse user command for workflow invocation
   * Format: /workflow_name or /workflow_name with description
   */
  parseWorkflowCommand(content: string): { name: string; description: string } | null {
    console.log(`[WorkflowService] Parsing workflow command: "${content}"`);
    
    const trimmed = content.trim();
    if (!trimmed.startsWith("/")) {
      console.log("[WorkflowService] Not a workflow command (doesn't start with /)");
      return null;
    }
    
    const spaceIndex = trimmed.indexOf(" ");
    let name: string;
    let description: string;
    
    if (spaceIndex === -1) {
      // Command is just "/workflow_name"
      name = trimmed.substring(1);
      description = "";
    } else {
      // Command is "/workflow_name with description"
      name = trimmed.substring(1, spaceIndex);
      description = trimmed.substring(spaceIndex + 1).trim();
    }
    
    if (name) {
      const result = { name, description };
      console.log("[WorkflowService] Parsed workflow command:", result);
      return result;
    }
    
    console.log("[WorkflowService] Failed to parse workflow name");
    return null;
  }

  /**
   * Validate workflow parameters
   */
  validateParameters(
    workflow: WorkflowDefinition,
    parameters: Record<string, any>
  ): { isValid: boolean; errorMessage?: string } {
    for (const param of workflow.parameters) {
      if (param.required && !(param.name in parameters)) {
        return {
          isValid: false,
          errorMessage: `Missing required parameter: ${param.name}`,
        };
      }
    }
    
    return { isValid: true };
  }
}

