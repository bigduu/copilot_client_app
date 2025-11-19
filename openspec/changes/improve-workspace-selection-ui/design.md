# Workspace Selection UI Design Document

## Architecture Overview

The enhanced workspace selection system consists of several interconnected components that provide an improved workspace management experience through HTTP API endpoints and enhanced frontend components, supporting multiple client types (web, desktop, etc.).

## Component Architecture

### Core Components

#### 1. Enhanced WorkspacePathModal
- **Location**: `src/components/WorkspacePathModal/index.tsx`
- **Purpose**: Main modal for workspace selection with enhanced browsing capabilities
- **Key Features**:
  - HTTP API integration for workspace management
  - Recent workspaces dropdown from backend
  - Real-time path validation via API
  - Manual input with enhanced validation
  - Path suggestions and auto-completion

#### 2. WorkspacePicker Component
- **Location**: `src/components/WorkspacePicker/index.tsx` (New)
- **Purpose**: Enhanced workspace browser with file tree and path management
- **Key Features**:
  - File tree browser component for path navigation
  - Path validation via HTTP API
  - Recent workspaces management
  - Path suggestions and auto-completion
  - Common directory shortcuts

#### 3. RecentWorkspacesManager
- **Location**: `src/services/RecentWorkspacesManager.ts` (New)
- **Purpose**: Service for managing recent workspace history via HTTP API
- **Key Features**:
  - Backend persistence of recent workspaces
  - Automatic cleanup of invalid paths
  - Maximum history size management
  - Cross-client synchronization

#### 4. WorkspaceValidator
- **Location**: `src/utils/workspaceValidator.ts` (New)
- **Purpose**: Utility for workspace path validation via HTTP API
- **Key Features**:
  - Real-time validation via API calls
  - Debounced validation for performance
  - Permission checking
  - Directory suitability assessment

### Service Integration

#### BackendContextService Enhancement
- **Location**: `src/services/BackendContextService.ts`
- **Changes**:
  - Add methods for recent workspace management via HTTP API
  - Enhanced validation support
  - Integration with new picker component
  - Error handling for API communication

#### HTTP API Endpoints (Rust Backend)
- **Location**: `crates/web_service/src/workspace_api.rs` (New)
- **Purpose**: RESTful API endpoints for workspace management
- **Key Features**:
  - Workspace path validation
  - Recent workspaces management
  - Path suggestions and auto-completion
  - File tree browsing capabilities
  - Cross-client workspace synchronization

## Technical Implementation Details

### HTTP API Implementation
```rust
// crates/web_service/src/workspace_api.rs
use actix_web::{get, post, web, HttpResponse};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct WorkspaceInfo {
    path: String,
    is_valid: bool,
    error_message: Option<String>,
    file_count: Option<usize>,
    last_modified: Option<String>,
}

#[post("/api/workspace/validate")]
async fn validate_workspace_path(
    body: web::Json<ValidatePathRequest>,
) -> Result<HttpResponse, Error> {
    // Validate path existence, permissions, etc.
    let validation_result = workspace_service::validate_path(&body.path).await?;
    Ok(HttpResponse::Ok().json(validation_result))
}

#[get("/api/workspace/recent")]
async fn get_recent_workspaces() -> Result<HttpResponse, Error> {
    let recent_workspaces = workspace_service::get_recent_workspaces().await?;
    Ok(HttpResponse::Ok().json(recent_workspaces))
}

#[post("/api/workspace/recent")]
async fn add_recent_workspace(
    body: web::Json<AddRecentRequest>,
) -> Result<HttpResponse, Error> {
    workspace_service::add_recent_workspace(&body.path).await?;
    Ok(HttpResponse::Ok().json({"status": "success"}))
}
```

### Frontend Service Integration
```typescript
// src/services/WorkspaceApiService.ts
export interface WorkspaceValidationResult {
  path: string;
  is_valid: boolean;
  error_message?: string;
  file_count?: number;
  last_modified?: string;
}

class WorkspaceApiService {
  async validateWorkspacePath(path: string): Promise<WorkspaceValidationResult> {
    const response = await fetch('/api/workspace/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return response.json();
  }

  async getRecentWorkspaces(): Promise<WorkspaceInfo[]> {
    const response = await fetch('/api/workspace/recent');
    return response.json();
  }

  async addRecentWorkspace(path: string): Promise<void> {
    await fetch('/api/workspace/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
  }
}
```

### Recent Workspaces Storage
- **Storage**: Backend persistence through HTTP API endpoints
- **Format**: Array of workspace objects with path, last used timestamp, metadata
- **Cleanup**: Automatic validation and removal of non-existent paths via backend filesystem operations
- **Synchronization**: Cross-client workspace history synchronization

### Validation Strategy
- **Real-time**: Frontend validation via HTTP API calls with debouncing
- **Server-side**: Backend validation for security and permissions
- **Visual feedback**: Immediate UI updates with validation states from API responses
- **Caching**: Client-side caching of validation results for performance

## UI/UX Design

### Modal Layout
1. **Header**: "设置 Workspace 路径" with description
2. **Current Path Display**: Shows currently configured workspace
3. **Input Section**:
   - Text input with real-time validation
   - "Browse" button for native folder picker
   - Recent workspaces dropdown
4. **Preview Section**: Path details and validation feedback
5. **Action Buttons**: Save, Cancel

### Interaction Flow
1. User triggers workspace selection (via @ or manual action)
2. Enhanced modal opens with current workspace (if any)
3. User can:
   - Browse folders using native picker
   - Select from recent workspaces
   - Manually type/edit path
4. Real-time validation provides feedback
5. User confirms selection and modal closes

## State Management

### Component State
```typescript
interface WorkspaceSelectionState {
  currentPath: string;
  isBrowsing: boolean;
  recentWorkspaces: WorkspaceEntry[];
  validationState: ValidationState;
  isLoading: boolean;
}
```

### Integration with Existing State
- Uses existing `useChatController` hook
- Integrates with current chat configuration
- Maintains existing workspace file caching

## Performance Considerations

### Lazy Loading
- Recent workspaces loaded on demand from HTTP API
- Path validation uses async HTTP calls with debouncing
- File tree browsing uses lazy loading for large directories

### Caching Strategy
- Client-side caching of validation results with TTL
- Backend caching of workspace metadata and file information
- Recent workspaces cached in memory and persisted via API
- Optimized API responses with minimal data transfer

## Security Considerations

### Path Validation
- Backend validation of all paths using secure filesystem API
- Prevention of path traversal attacks through server-side validation
- Permission checking before workspace access via backend authentication
- Input sanitization and validation for all API requests

### API Security
- Authentication and authorization for workspace API endpoints
- Rate limiting for validation requests to prevent abuse
- CORS configuration for web client access
- Secure file system access with proper permission checks
- All path operations performed through secure backend services

## Migration Strategy

### Backward Compatibility
- Existing `WorkspacePathModal` interface maintained
- Gradual enhancement of existing functionality
- Fallback to manual input if native features unavailable

### Phased Rollout
1. Implement enhanced modal with basic browsing
2. Add recent workspaces functionality
3. Implement advanced validation and preview
4. Optimize performance and add polish

## Testing Strategy

### Unit Tests
- Component behavior and state management
- Validation logic and edge cases
- Recent workspaces management

### Integration Tests
- Tauri API integration
- Backend service communication
- File system interactions

### User Experience Tests
- Modal interaction flows
- Keyboard navigation and accessibility
- Error handling and recovery scenarios