# Deprecated Frontend Modules

- services/SessionService.ts
  - Origin: `src/services/SessionService.ts`
  - Reason: Endpoint `/session/*` not implemented in backend; unused in active UI.

- services/WorkflowService.ts
  - Origin: `src/services/WorkflowService.ts`
  - Reason: Endpoint `/workflows/*` not implemented; workflow UI uses `/bodhi/workflows` instead.

- types/toolConfig.ts
  - Origin: `src/types/toolConfig.ts`
  - Reason: Relies on Tauri commands that are not registered; unused in active UI.

- types/toolCategory.ts
  - Origin: `src/types/toolCategory.ts`
  - Reason: Tool category logic is unused in current UI flow.

- utils/dynamicCategoryConfig.ts
  - Origin: `src/utils/dynamicCategoryConfig.ts`
  - Reason: No active references; superseded by backend-driven tool categorization.

- services/HttpToolService.ts
  - Origin: `src/services/HttpServices.ts` (HttpToolService class)
  - Reason: Relies on non-existent `/tools/*` endpoints in the current backend; no active call sites.

- services/TauriChatService.ts
  - Origin: `src/services/TauriService.ts` (TauriChatService class)
  - Reason: Uses a non-registered `execute_prompt` command and has no active call sites.
