# Deprecated Frontend Modules

- hooks/useAgentApproval.ts
  - Origin: `src/hooks/useAgentApproval.ts`
  - Reason: No active references; agent approval flow is not used in current UI.

- hooks/useServiceHealth.ts
  - Origin: `src/hooks/useServiceHealth.ts`
  - Reason: No active references; health checks are not surfaced in the UI.

- contexts/ChatControllerContext.tsx
  - Origin: `src/contexts/ChatControllerContext.tsx`
  - Reason: Replaced by direct store/hook usage; no active references.

- services/HealthService.ts
  - Origin: `src/services/HealthService.ts`
  - Reason: Only used by deprecated health hook; no active references.

- services/AgentApprovalService.ts
  - Origin: `src/services/AgentApprovalService.ts`
  - Reason: No active references in current agent flow.

- services/TemplateVariableService.ts
  - Origin: `src/services/TemplateVariableService.ts`
  - Reason: No active references; template variables are handled elsewhere.

- services/UserPreferenceService.ts
  - Origin: `src/services/UserPreferenceService.ts`
  - Reason: No active references; preferences handled via store/local storage.

- services/index.ts
  - Origin: `src/services/index.ts`
  - Reason: Legacy barrel file; no active references.

- services/SessionService.ts
  - Origin: `src/services/SessionService.ts`
  - Reason: Endpoint `/session/*` not implemented in backend; unused in active UI.

- services/WorkflowService.ts
  - Origin: `src/services/WorkflowService.ts`
  - Reason: Endpoint `/workflows/*` not implemented; workflow UI uses `/bodhi/workflows` instead.

- services/HttpToolService.ts
  - Origin: `src/services/HttpServices.ts` (HttpToolService class)
  - Reason: Relies on non-existent `/tools/*` endpoints in the current backend; no active call sites.

- services/TauriChatService.ts
  - Origin: `src/services/TauriService.ts` (TauriChatService class)
  - Reason: Uses a non-registered `execute_prompt` command and has no active call sites.

- types/toolConfig.ts
  - Origin: `src/types/toolConfig.ts`
  - Reason: Relies on Tauri commands that are not registered; unused in active UI.

- types/toolCategory.ts
  - Origin: `src/types/toolCategory.ts`
  - Reason: Tool category logic is unused in current UI flow.

- utils/dynamicCategoryConfig.ts
  - Origin: `src/utils/dynamicCategoryConfig.ts`
  - Reason: No active references; superseded by backend-driven tool categorization.

- utils/approvalUtils.ts
  - Origin: `src/utils/approvalUtils.ts`
  - Reason: No active references; approval UI is not used.

- utils/iconMapper.tsx
  - Origin: `src/utils/iconMapper.tsx`
  - Reason: No active references; icon mapping handled elsewhere.

- utils/throttle.ts
  - Origin: `src/utils/throttle.ts`
  - Reason: No active references.

- utils/migration/cleanupLegacyStorage.ts
  - Origin: `src/utils/migration/cleanupLegacyStorage.ts`
  - Reason: Legacy migration is not invoked in current flows.
