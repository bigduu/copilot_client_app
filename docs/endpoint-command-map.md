# Endpoint and Command Map

## HTTP Endpoints (Backend: `crates/web_service`)

### `/v1/models`
- Backend: `crates/web_service/src/controllers/openai_controller.rs`
- Frontend: `src/services/ModelService.ts` → `src/store/slices/modelSlice.ts`

### `/v1/chat/completions`
- Backend: `crates/web_service/src/controllers/openai_controller.rs`
- Frontend: `src/services/openaiClient.ts` → chat hooks/components

### `/v1/messages`
- Backend: `crates/web_service/src/controllers/anthropic_controller.rs`
- Frontend: `src/services/openaiClient.ts` (Anthropic compatibility)

### `/v1/complete`
- Backend: `crates/web_service/src/controllers/anthropic_controller.rs`
- Frontend: not referenced directly (kept for compatibility)

### `/v1/bodhi/workflows`
- Backend: `crates/web_service/src/controllers/bodhi_controller.rs`
- Frontend: `src/services/WorkflowManagerService.ts`

### `/v1/bodhi/workflows/{name}`
- Backend: `crates/web_service/src/controllers/bodhi_controller.rs`
- Frontend: `src/services/WorkflowManagerService.ts`

### `/v1/tools/execute`
- Backend: `crates/web_service/src/controllers/tools_controller.rs`
- Frontend: `src/services/ToolService.ts`

### `/v1/workspace/validate`
- Backend: `crates/web_service/src/controllers/workspace_controller.rs`
- Frontend: `src/utils/workspaceValidator.ts`

### `/v1/workspace/recent`
- Backend: `crates/web_service/src/controllers/workspace_controller.rs`
- Frontend: `src/services/RecentWorkspacesManager.ts`, `src/services/WorkspaceApiService.ts`

### `/v1/workspace/suggestions`
- Backend: `crates/web_service/src/controllers/workspace_controller.rs`
- Frontend: `src/services/WorkspaceApiService.ts`

### `/v1/workspace/browse-folder`
- Backend: `crates/web_service/src/controllers/workspace_controller.rs`
- Frontend: `src/services/WorkspaceApiService.ts` → `src/components/FolderBrowser/index.tsx`

## Tauri Commands (Backend: `src-tauri/src/command`)

### `copy_to_clipboard`
- Backend: `src-tauri/src/command/copy.rs`
- Frontend: `src/services/TauriService.ts` → `src/services/ServiceFactory.ts`

### `pick_folder`
- Backend: `src-tauri/src/command/file_picker.rs`
- Frontend: not referenced directly (available for future UX)

### `get_claude_binary_path`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: not referenced directly

### `set_claude_binary_path`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: not referenced directly

### `list_claude_projects`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `list_project_sessions`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `get_session_jsonl`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `execute_claude_code`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `continue_claude_code`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `resume_claude_code`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`

### `cancel_claude_execution`
- Backend: `src-tauri/src/command/claude_code.rs`
- Frontend: `src/services/ClaudeCodeService.ts`
