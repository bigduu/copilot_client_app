# Workflow System Architecture

## Overview
The Workflow System provides a mechanism for users to explicitly invoke complex, multi-step operations through a form-based UI. Unlike Tools (which are LLM-driven), Workflows are user-initiated actions that give users full control over high-risk or destructive operations.

## Key Concepts

### 🎯 Workflows vs Tools

| Aspect | Workflows | Tools |
|--------|-----------|-------|
| **Invocation** | User-explicit (form-based) | LLM-autonomous (JSON) |
| **Purpose** | Complex, user-controlled actions | LLM information gathering/manipulation |
| **Risk Level** | High-risk, destructive operations | Safe, read-heavy operations |
| **UI** | Parameter form with validation | No direct UI (JSON parameters) |
| **Examples** | Create project, Run tests, Git operations | Read file, Search, Append file |
| **Approval** | Built into workflow UI | Separate approval modal |
| **Accessibility** | Frontend only (via API) | Backend only (in agent loop) |

### 🏗️ Workflow Structure

```rust
pub trait Workflow {
    fn definition(&self) -> WorkflowDefinition;
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError>;
}

pub struct WorkflowDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Vec<Parameter>,
    pub category: String,
    pub requires_approval: bool,
    pub custom_prompt: Option<String>,
}
```

### 📦 Workflow Categories

Workflows are organized into categories for better UX:

```rust
pub struct WorkflowCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
}
```

**Standard Categories**:
- `general` - General-purpose workflows
- `file_operations` - File creation, modification, deletion
- `system` - System commands, environment operations
- `git` - Git operations (future)
- `testing` - Test execution (future)
- `project` - Project scaffolding (future)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Types "/"                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WorkflowSelector (Frontend)                    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 1. Fetch Available Workflows                           │    │
│  │    GET /v1/workflows/available                         │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 2. Display Workflow List                               │    │
│  │    - Filter by search term                             │    │
│  │    - Group by category                                 │    │
│  │    - Keyboard navigation                               │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ User selects workflow
┌─────────────────────────────────────────────────────────────────┐
│              WorkflowParameterForm (Frontend)                    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 3. Generate Form from Workflow Definition              │    │
│  │    - Text inputs for string parameters                 │    │
│  │    - Validation for required fields                    │    │
│  │    - Default values                                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼ User fills form and submits      │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 4. Submit Workflow Execution                           │    │
│  │    POST /v1/workflows/execute                          │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WorkflowController (Backend)                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 5. Validate Request                                    │    │
│  │    - Check workflow exists                             │    │
│  │    - Validate parameters                               │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 6. Execute Workflow (WorkflowExecutor)                 │    │
│  │    - Lookup workflow by name                           │    │
│  │    - Call workflow.execute(parameters)                 │    │
│  │    - Capture result                                    │    │
│  └────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 7. Return Result to Frontend                           │    │
│  │    - Success: result data                              │    │
│  │    - Failure: error message                            │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│            WorkflowExecutionFeedback (Frontend)                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ 8. Display Result to User                              │    │
│  │    - Success message with details                      │    │
│  │    - Error message with suggestions                    │    │
│  │    - Formatted output                                  │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### Backend Components

#### WorkflowRegistry
**Location**: `crates/workflow_system/src/registry/registries.rs`

**Responsibilities**:
- Store all registered workflows
- Lookup workflows by name
- List available workflows
- Organize workflows by category

**Key Methods**:
```rust
impl WorkflowRegistry {
    pub fn register(&mut self, workflow: Box<dyn Workflow + Send + Sync>);
    pub fn get_workflow(&self, name: &str) -> Option<&(dyn Workflow + Send + Sync)>;
    pub fn list_workflows(&self) -> Vec<WorkflowDefinition>;
}
```

#### WorkflowExecutor
**Location**: `crates/workflow_system/src/executor.rs`

**Responsibilities**:
- Execute workflows by name
- Validate parameters before execution
- Handle execution errors
- Return structured results

**Key Methods**:
```rust
impl WorkflowExecutor {
    pub async fn execute(
        &self,
        workflow_name: &str,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError>;
    
    pub fn list_workflows(&self) -> Vec<WorkflowDefinition>;
}
```

#### WorkflowService
**Location**: `crates/web_service/src/services/workflow_service.rs`

**Responsibilities**:
- Business logic layer for workflows
- Coordinate with WorkflowExecutor
- Add logging and telemetry
- Handle service-level errors

#### WorkflowController
**Location**: `crates/web_service/src/controllers/workflow_controller.rs`

**Endpoints**:
```http
GET /v1/workflows/available
GET /v1/workflows/{name}
GET /v1/workflows/categories
POST /v1/workflows/execute
```

### Frontend Components

#### WorkflowService
**Location**: `src/services/WorkflowService.ts`

**Responsibilities**:
- API client for workflow endpoints
- Fetch available workflows
- Execute workflows
- Handle errors

#### WorkflowSelector
**Location**: `src/components/WorkflowSelector/index.tsx`

**Responsibilities**:
- Display workflow list
- Filter workflows by search
- Keyboard navigation
- Auto-completion
- Emit selection events

#### WorkflowParameterForm
**Location**: `src/components/WorkflowParameterForm/index.tsx`

**Responsibilities**:
- Generate form from WorkflowDefinition
- Validate required fields
- Handle form submission
- Display custom prompts

#### WorkflowExecutionFeedback
**Location**: `src/components/WorkflowExecutionFeedback/index.tsx`

**Responsibilities**:
- Display execution results
- Format success/error messages
- Show structured output
- Provide retry options

## Workflow Examples

### EchoWorkflow
**Category**: `general`
**Purpose**: Simple example workflow for testing

```rust
#[derive(Debug, Default)]
pub struct EchoWorkflow;

#[async_trait]
impl Workflow for EchoWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "echo".to_string(),
            description: "Echoes back the provided message".to_string(),
            parameters: vec![
                Parameter {
                    name: "message".to_string(),
                    description: "The message to echo back".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                }
            ],
            category: "general".to_string(),
            requires_approval: false,
            custom_prompt: None,
        }
    }
    
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let message = parameters
            .get("message")
            .and_then(|v| v.as_str())
            .ok_or_else(|| WorkflowError::InvalidParameters(
                "message parameter is required".to_string()
            ))?;
        
        Ok(serde_json::json!({
            "success": true,
            "echo": message
        }))
    }
}

register_workflow!(EchoWorkflow, "echo");
```

### CreateFileWorkflow
**Category**: `file_operations`
**Purpose**: Create new files with content

```rust
#[derive(Debug, Default)]
pub struct CreateFileWorkflow;

#[async_trait]
impl Workflow for CreateFileWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "create_file".to_string(),
            description: "Creates a new file with the specified content".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path where the file should be created".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "content".to_string(),
                    description: "The content to write to the file".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: Some("".to_string()),
                }
            ],
            category: "file_operations".to_string(),
            requires_approval: true,
            custom_prompt: Some(
                "This workflow will create a new file. \
                 Please review the path and content before approving."
                .to_string()
            ),
        }
    }
    
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        let path = parameters
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| WorkflowError::InvalidParameters(
                "path parameter is required".to_string()
            ))?;
        
        let content = parameters
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        
        fs::write(path, content)
            .await
            .map_err(|e| WorkflowError::ExecutionFailed(
                format!("Failed to write file: {}", e)
            ))?;
        
        Ok(serde_json::json!({
            "success": true,
            "path": path,
            "message": format!("File created successfully at {}", path)
        }))
    }
}

register_workflow!(CreateFileWorkflow, "create_file");
```

### ExecuteCommandWorkflow
**Category**: `system`
**Purpose**: Execute shell commands with safety warnings

```rust
#[derive(Debug, Default)]
pub struct ExecuteCommandWorkflow;

#[async_trait]
impl Workflow for ExecuteCommandWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "execute_command".to_string(),
            description: "Executes a shell command with full visibility and control".to_string(),
            parameters: vec![
                Parameter {
                    name: "command".to_string(),
                    description: "The shell command to execute".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "working_directory".to_string(),
                    description: "The working directory for command execution (optional)".to_string(),
                    required: false,
                    param_type: "string".to_string(),
                    default: None,
                }
            ],
            category: "system".to_string(),
            requires_approval: true,
            custom_prompt: Some(
                "⚠️ Command Execution\n\n\
                This will execute a shell command on your system.\n\
                Please review the command carefully before approving.\n\n\
                Security considerations:\n\
                - Commands have access to your filesystem\n\
                - Commands can access the network\n\
                - Commands run with your user permissions\n\n\
                Only approve commands you understand and trust."
                .to_string()
            ),
        }
    }
    
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        // Implementation with 5-minute timeout
        // ... (see full implementation in codebase)
    }
}

register_workflow!(ExecuteCommandWorkflow, "execute_command");
```

### DeleteFileWorkflow
**Category**: `file_operations`
**Purpose**: Delete files with explicit confirmation

```rust
#[derive(Debug, Default)]
pub struct DeleteFileWorkflow;

#[async_trait]
impl Workflow for DeleteFileWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "delete_file".to_string(),
            description: "Deletes a file from the filesystem (requires confirmation)".to_string(),
            parameters: vec![
                Parameter {
                    name: "path".to_string(),
                    description: "The path of the file to delete".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                Parameter {
                    name: "confirm".to_string(),
                    description: "Type 'DELETE' to confirm deletion".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                }
            ],
            category: "file_operations".to_string(),
            requires_approval: true,
            custom_prompt: Some(
                "⚠️ File Deletion\n\n\
                This will permanently delete the specified file.\n\
                This action cannot be undone.\n\n\
                Please review the file path carefully before approving."
                .to_string()
            ),
        }
    }
    
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        // Requires explicit "DELETE" confirmation
        // ... (see full implementation in codebase)
    }
}

register_workflow!(DeleteFileWorkflow, "delete_file");
```

## Creating New Workflows

### Step 1: Define Workflow Struct

```rust
use async_trait::async_trait;
use std::collections::HashMap;
use crate::types::{Parameter, Workflow, WorkflowDefinition, WorkflowError};
use crate::register_workflow;

#[derive(Debug, Default)]
pub struct MyWorkflow;
```

### Step 2: Implement Workflow Trait

```rust
#[async_trait]
impl Workflow for MyWorkflow {
    fn definition(&self) -> WorkflowDefinition {
        WorkflowDefinition {
            name: "my_workflow".to_string(),
            description: "Description of what this workflow does".to_string(),
            parameters: vec![
                Parameter {
                    name: "param1".to_string(),
                    description: "Description of param1".to_string(),
                    required: true,
                    param_type: "string".to_string(),
                    default: None,
                },
                // Add more parameters...
            ],
            category: "general".to_string(),  // or file_operations, system, etc.
            requires_approval: false,  // or true for dangerous operations
            custom_prompt: None,  // or Some("Warning message...".to_string())
        }
    }
    
    async fn execute(
        &self,
        parameters: HashMap<String, serde_json::Value>,
    ) -> Result<serde_json::Value, WorkflowError> {
        // 1. Extract and validate parameters
        let param1 = parameters
            .get("param1")
            .and_then(|v| v.as_str())
            .ok_or_else(|| WorkflowError::InvalidParameters(
                "param1 is required".to_string()
            ))?;
        
        // 2. Perform workflow logic
        // ... your implementation here ...
        
        // 3. Return result
        Ok(serde_json::json!({
            "success": true,
            "message": "Workflow completed successfully",
            // Include any result data...
        }))
    }
}
```

### Step 3: Register Workflow

```rust
register_workflow!(MyWorkflow, "my_workflow");
```

### Step 4: Add to Module

```rust
// In src/examples/mod.rs or your workflow module
pub mod my_workflow;
pub use my_workflow::MyWorkflow;
```

## Best Practices

### Workflow Design

1. **Single Responsibility**: Each workflow should do one thing well
2. **Clear Parameters**: Use descriptive parameter names and descriptions
3. **Validation**: Validate all parameters before execution
4. **Error Handling**: Return clear error messages
5. **Idempotency**: Make workflows safe to retry when possible

### Security

1. **Approval for Dangerous Operations**: Set `requires_approval=true`
2. **Custom Prompts**: Add warnings for high-risk operations
3. **Input Sanitization**: Validate and sanitize all user inputs
4. **Confirmation Parameters**: Add explicit confirmation for destructive actions
5. **Timeout Protection**: Add timeouts for long-running operations

### User Experience

1. **Clear Descriptions**: Help users understand what the workflow does
2. **Sensible Defaults**: Provide default values when appropriate
3. **Helpful Error Messages**: Guide users to fix issues
4. **Progress Feedback**: For long operations, provide status updates
5. **Result Formatting**: Return structured, readable results

### Testing

1. **Unit Tests**: Test workflow logic in isolation
2. **Parameter Validation**: Test all parameter combinations
3. **Error Scenarios**: Test failure paths
4. **Integration Tests**: Test end-to-end execution

## API Reference

### List Available Workflows

```http
GET /v1/workflows/available

Response:
{
  "workflows": [
    {
      "name": "echo",
      "description": "Echoes back the provided message",
      "parameters": [...],
      "category": "general",
      "requires_approval": false,
      "custom_prompt": null
    },
    ...
  ]
}
```

### Get Workflow Details

```http
GET /v1/workflows/{name}

Response:
{
  "name": "echo",
  "description": "Echoes back the provided message",
  "parameters": [
    {
      "name": "message",
      "description": "The message to echo back",
      "required": true,
      "param_type": "string",
      "default": null
    }
  ],
  "category": "general",
  "requires_approval": false,
  "custom_prompt": null
}
```

### List Workflow Categories

```http
GET /v1/workflows/categories

Response:
{
  "categories": [
    {
      "id": "general",
      "name": "General",
      "description": "General-purpose workflows",
      "icon": null,
      "workflow_count": 1
    },
    {
      "id": "file_operations",
      "name": "File Operations",
      "description": "File creation, modification, and deletion",
      "icon": "📁",
      "workflow_count": 2
    },
    ...
  ]
}
```

### Execute Workflow

```http
POST /v1/workflows/execute

Request:
{
  "workflow_name": "echo",
  "parameters": {
    "message": "Hello, World!"
  }
}

Response (Success):
{
  "success": true,
  "result": {
    "echo": "Hello, World!"
  }
}

Response (Error):
{
  "error": "Invalid parameters: message parameter is required"
}
```

## Related Documentation

- [Agent Loop Architecture](./AGENT_LOOP_ARCHITECTURE.md) - LLM-driven tool system
- [Tool Classification Analysis](../../TOOL_CLASSIFICATION_ANALYSIS.md) - Tool vs Workflow decisions
- [OpenSpec Proposal](../../openspec/changes/refactor-tools-to-llm-agent-mode/proposal.md) - Original design

## Future Enhancements

### Planned Features

1. **Workflow Templates**:
   - Pre-configured workflows for common tasks
   - User-customizable templates
   - Template marketplace

2. **Workflow Chaining**:
   - Compose multiple workflows
   - Conditional execution
   - Parallel execution

3. **Workflow Scheduling**:
   - Run workflows on schedule
   - Cron-like syntax
   - Background execution

4. **Workflow History**:
   - Track execution history
   - Re-run previous workflows
   - Analytics and insights

5. **Advanced Categories**:
   - Git operations (commit, push, pull, branch)
   - Testing (unit tests, integration tests)
   - Project scaffolding (create React app, Rust project, etc.)
   - Database operations (migrations, backups)
   - API operations (REST, GraphQL)

## Conclusion

The Workflow System provides:
- **User Control**: Explicit user invocation of complex operations
- **Safety**: Approval gates and confirmation for dangerous actions
- **Flexibility**: Easy to create new workflows
- **Extensibility**: Clear registration mechanism
- **Good UX**: Form-based parameter input with validation

This system complements the LLM-driven Tool System, providing a complete solution for both autonomous and user-controlled operations.

