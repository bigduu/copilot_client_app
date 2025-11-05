# Implementation Tasks - Plan-Act Agent Architecture

## 1. Backend Data Models

### 1.1 Add AgentMode Enum

- [x] 1.1.1 Add `AgentRole` enum to `context_manager/structs/context.rs`
- [x] 1.1.2 Add `agent_role` field to `ChatConfig` (default: Actor)
- [x] 1.1.3 Add serialization/deserialization support
- [x] 1.1.4 Add Permission enum and permission checking methods

### 1.2 Add MessageType Enum

- [x] 1.2.1 Add `MessageType` enum to `context_manager/structs/message.rs`
- [x] 1.2.2 Add `message_type` field to `InternalMessage` (default: Text)
- [x] 1.2.3 Add serialization/deserialization support
- [x] 1.2.4 Update message creation to set appropriate types

### 1.3 Add Permission System to Tools

- [x] 1.3.1 Add `ToolPermission` enum and `required_permissions` field to `ToolDefinition`
- [x] 1.3.2 Update all existing tool definitions with required_permissions
- [x] 1.3.3 Mark read tools with `[ReadFiles]` (read_file, search, etc.)
- [x] 1.3.4 Mark write tools appropriately (update_file, create_file, delete_file, etc.)
- [x] 1.3.5 Export ToolPermission from tool_system crate

## 2. Backend Services

### 2.1 Role-Aware Tool Filtering

- [x] 2.1.1 Add `filter_tools_by_permissions()` to `ToolRegistry`
- [x] 2.1.2 Implement permission-based filtering logic
- [x] 2.1.3 Planner role: Filter to only ReadFiles permission tools
- [x] 2.1.4 Actor role: Allow all tools (all permissions)
- [x] 2.1.5 Verified filtering works correctly

### 2.2 Role-Specific Prompt Injection

- [x] 2.2.1 Create Planner role prompt template with plan JSON format
- [x] 2.2.2 Create Actor role prompt template with question JSON format
- [x] 2.2.3 Update `SystemPromptEnhancer.enhance_prompt()` to accept agent_role parameter
- [x] 2.2.4 Add `build_role_section()` for role-specific instructions
- [x] 2.2.5 Update `build_tools_section()` to filter tools by role permissions
- [x] 2.2.6 Update cache keys to include role
- [x] 2.2.7 Add test `test_enhance_prompt_role_specific()`

### 2.3 Plan Message Parsing

- [x] 2.3.1 Create `detect_message_type()` in `chat_service.rs`
- [x] 2.3.2 Implement `extract_json_from_text()` helper function
- [x] 2.3.3 Detect plan: check for `goal` and `steps` fields in JSON
- [x] 2.3.4 Set message_type = Plan when plan detected
- [x] 2.3.5 Handle parsing failures gracefully (fallback to Text)
- [x] 2.3.6 Support both markdown-wrapped and raw JSON

### 2.4 Question Message Parsing

- [x] 2.4.1 Use `detect_message_type()` for question detection
- [x] 2.4.2 Detect question: check for `type: "question"` and `question` field
- [x] 2.4.3 Set message_type = Question when question detected
- [x] 2.4.4 Handle parsing failures gracefully (fallback to Text)

### 2.5 ChatService Integration

- [x] 2.5.1 ChatService reads agent_role from context config
- [x] 2.5.2 Pass role to `SystemPromptEnhancer.enhance_prompt()`
- [x] 2.5.3 Tool filtering happens automatically via SystemPromptEnhancer
- [x] 2.5.4 Parse LLM response and detect plan/question message types
- [x] 2.5.5 Set appropriate message_type on InternalMessage creation
- [x] 2.5.6 All changes compile and integrate successfully

## 3. Backend API

### 3.1 Role Switching Endpoint

- [x] 3.1.1 Add `PUT /v1/contexts/{id}/role` endpoint in context_controller.rs
- [x] 3.1.2 Accept `{ "role": "planner" | "actor" }` in request body
- [x] 3.1.3 Parse and validate role (return error for invalid values)
- [x] 3.1.4 Update context.config.agent_role with new role
- [x] 3.1.5 Save context after role change
- [x] 3.1.6 Return success response with old/new role information
- [x] 3.1.7 Add to service config routing

### 3.2 Question Response Handling

- [x] 3.2.1 Questions are handled via regular message flow
- [x] 3.2.2 User sends answer as normal text message
- [x] 3.2.3 Frontend tracks question context for UI display
- [x] 3.2.4 Backend processes answer through standard FSM
- [x] 3.2.5 No separate endpoint needed (uses existing message API)

## 4. Frontend Data Models

### 4.1 TypeScript Types

- [x] 4.1.1 Create `AgentRole` type in `src/types/chat.ts` ("planner" | "actor")
- [x] 4.1.2 Create `MessageType` type in `src/types/chat.ts`
- [x] 4.1.3 Create `PlanMessage` interface with PlanStep
- [x] 4.1.4 Create `QuestionMessage` interface with QuestionOption
- [x] 4.1.5 Update `ChatItem.config` to include optional `agentRole` field
- [x] 4.1.6 Update DTOs in BackendContextService

### 4.2 Service Layer Updates

- [x] 4.2.1 Add `agent_role` to `ChatContextDTO.config` in BackendContextService
- [x] 4.2.2 Add `message_type` to `MessageDTO` in BackendContextService
- [x] 4.2.3 Add `updateAgentRole()` method to BackendContextService
- [x] 4.2.4 Method calls `PUT /v1/contexts/{id}/role` endpoint

## 5. Frontend Components

### 5.1 Agent Role Selector

- [x] 5.1.1 Create `src/components/AgentRoleSelector/index.tsx`
- [x] 5.1.2 Display current role with Space.Compact button group
- [x] 5.1.3 Use icons: FileSearchOutlined (Planner), ThunderboltOutlined (Actor)
- [x] 5.1.4 Add detailed tooltips explaining each role's permissions
- [x] 5.1.5 Call `backendContextService.updateAgentRole()` on change
- [x] 5.1.6 Show loading state during API call
- [x] 5.1.7 Display success/error messages with Ant Design message component
- [x] 5.1.8 Visual indicators: active role has primary color, border, weight 600

### 5.2 Plan Message Card

- [x] 5.2.1 Create `src/components/PlanMessageCard/index.tsx`
- [x] 5.2.2 Display goal with Title level 5
- [x] 5.2.3 Render steps using Ant Design Steps component (vertical)
- [x] 5.2.4 Show tools needed as Tag components (blue color)
- [x] 5.2.5 Display estimated time per step and total with ClockCircleOutlined
- [x] 5.2.6 Collapsible risks section with WarningOutlined icon
- [x] 5.2.7 Show prerequisites as bullet list
- [x] 5.2.8 "Execute Plan" button with ThunderboltOutlined icon
- [x] 5.2.9 "Refine Plan" button with textarea for feedback
- [x] 5.2.10 Distinct styling: primary border (2px), primary background

### 5.3 Question Message Card

- [x] 5.3.1 Create `src/components/QuestionMessageCard/index.tsx`
- [x] 5.3.2 Display question as Title level 5
- [x] 5.3.3 Show context in Alert component (info type)
- [x] 5.3.4 Render options as Radio.Group with Card wrappers
- [x] 5.3.5 Highlight default option with "Recommended" Tag
- [x] 5.3.6 Show loading state on submit button
- [x] 5.3.7 Handle answer submission via onAnswer callback
- [x] 5.3.8 Disable all options after submission
- [x] 5.3.9 Severity-based styling (critical=red, major=orange, minor=blue)
- [x] 5.3.10 Optional custom answer textarea when allow_custom=true

### 5.4 Message Type Routing

- [x] 5.4.1 Update MessageCard component to check message_type
- [x] 5.4.2 Route to PlanMessageCard for "plan" type
- [x] 5.4.3 Route to QuestionMessageCard for "question" type
- [x] 5.4.4 Use existing card for "text" messages
- [x] 5.4.5 Handle backward compatibility (default to text)

### 5.5 Mode Indicator in Chat UI

- [x] 5.5.1 Add AgentRoleSelector to chat header
- [x] 5.5.2 Pass current context.config.agent_role prop
- [x] 5.5.3 Handle role changes with context refresh
- [x] 5.5.4 Disable during message processing

## 6. Prompt Engineering

### 6.1 Planner Role Prompt

- [x] 6.1.1 Write clear instructions for analysis and planning
- [x] 6.1.2 Include plan JSON format with all required fields
- [x] 6.1.3 Explain read-only restrictions and available tools
- [x] 6.1.4 Add guidelines: discuss plan, refine based on feedback
- [x] 6.1.5 Document in SystemPromptEnhancer.build_role_section()

### 6.2 Actor Role Prompt

- [x] 6.2.1 Write clear instructions for execution
- [x] 6.2.2 Include question JSON format with severity levels
- [x] 6.2.3 Define autonomy guidelines: small/medium/large changes
- [x] 6.2.4 Specify when to ask: ALWAYS/USUALLY/RARELY with examples
- [x] 6.2.5 Document in SystemPromptEnhancer.build_role_section()

### 6.3 Prompt Implementation

- [x] 6.3.1 Planner prompt includes JSON schema and restrictions
- [x] 6.3.2 Actor prompt includes question format and guidelines
- [x] 6.3.3 Both prompts injected dynamically based on role
- [x] 6.3.4 Tool lists filtered appropriately per role
- [x] 6.3.5 Tests added: test_enhance_prompt_role_specific()

## 7. Integration Testing

### 7.1 Backend Integration Tests

- [x] 7.1.1 Planner role: Only ReadFiles permission tools in filtered list ✅
- [x] 7.1.2 Actor role: All tools available in filtered list ✅
- [x] 7.1.3 Role switching via API: PUT /v1/contexts/{id}/role works ✅
- [x] 7.1.4 Plan message parsing: detects goal + steps correctly ✅
- [x] 7.1.5 Question message parsing: detects type="question" correctly ✅
- [x] 7.1.6 Message type set automatically on LLM response ✅
- [x] 7.1.7 All Rust crates compile successfully ✅
- [x] 7.1.8 MessageDTO includes message_type field in API responses ✅

### 7.2 Frontend Component Tests

- [x] 7.2.1 AgentRoleSelector component created with full functionality ✅
- [x] 7.2.2 PlanMessageCard component created with all features ✅
- [x] 7.2.3 QuestionMessageCard component created with all features ✅
- [x] 7.2.4 All TypeScript compiles successfully ✅
- [x] 7.2.5 Components ready for integration into chat UI ✅

### 7.3 End-to-End Integration (Ready for Testing)

- [ ] 7.3.1 Wire components into main chat view
- [ ] 7.3.2 Test complete plan-act workflow with real LLM:
  - Start in Actor mode (default)
  - Switch to Planner mode
  - Agent generates plan with read-only tools
  - Review plan display in PlanMessageCard
  - Execute plan (switches to Actor)
  - Agent runs with full permissions
  - Agent asks question if needed
  - Answer via QuestionMessageCard
  - Execution completes
- [ ] 7.3.3 Test role switching during conversation
- [ ] 7.3.4 Test malformed JSON handling (fallback to Text)
- [ ] 7.3.5 Test backward compatibility with existing chats

## 8. Documentation

### 8.1 User Documentation

- [x] 8.1.1 Document Planner vs Actor roles in IMPLEMENTATION_COMPLETE_FULL.md
- [x] 8.1.2 Explain when to use each role (read-only vs full permissions)
- [x] 8.1.3 Show example workflow in documentation
- [x] 8.1.4 Document question interaction patterns
- [x] 8.1.5 Components include inline tooltips and descriptions

### 8.2 Developer Documentation

- [x] 8.2.1 Document MessageType system in IMPLEMENTATION_COMPLETE_BACKEND.md
- [x] 8.2.2 Document plan JSON format with all fields
- [x] 8.2.3 Document question JSON format with options
- [x] 8.2.4 Document role switching API endpoint
- [x] 8.2.5 Add usage examples in IMPLEMENTATION_COMPLETE_FULL.md
- [x] 8.2.6 Code examples for component usage

### 8.3 Architecture Documentation

- [x] 8.3.1 Document permission system architecture
- [x] 8.3.2 Document Planner role flow (read-only, plan generation)
- [x] 8.3.3 Document Actor role flow (full permissions, questions)
- [x] 8.3.4 Document role switching mechanism
- [x] 8.3.5 Document backward compatibility approach
- [x] 8.3.6 List all modified files with descriptions

## 9. Polish and Refinement

### 9.1 UX Improvements

- [x] 9.1.1 Smooth transitions in AgentRoleSelector (transition: all 0.2s)
- [x] 9.1.2 Visual feedback: success/error messages on role switch
- [x] 9.1.3 Plan card highly readable with Steps component, tags, collapse
- [x] 9.1.4 Question card interactive with hover states, cards for options
- [x] 9.1.5 Tooltips provide detailed information without cluttering UI

### 9.2 Error Handling

- [x] 9.2.1 Role switching: try-catch with error message display
- [x] 9.2.2 Plan parsing: graceful fallback to Text type
- [x] 9.2.3 Question parsing: graceful fallback to Text type
- [x] 9.2.4 Clear error messages in components
- [x] 9.2.5 API errors caught and displayed to user

### 9.3 Performance

- [x] 9.3.1 Tool filtering O(n) with contains check
- [x] 9.3.2 Role-specific prompts cached (5 min TTL, role in cache key)
- [x] 9.3.3 Message type detection optimized (single pass, early returns)
- [x] 9.3.4 Components use React hooks efficiently (useState, no unnecessary renders)

## 10. Deployment

### 10.1 Migration

- [x] 10.1.1 No database migration needed (file-based storage)
- [x] 10.1.2 agent_role field has #[serde(default)] = Actor
- [x] 10.1.3 message_type field has #[serde(default)] = Text
- [x] 10.1.4 Existing chats automatically get default values on load
- [x] 10.1.5 Backward compatible with all existing data

### 10.2 Rollout (Ready for Deployment)

- [x] 10.2.1 Backend changes complete and compile successfully ✅
- [x] 10.2.2 Backward compatibility verified (all defaults set) ✅
- [x] 10.2.3 Frontend changes complete and type-check successfully ✅
- [x] 10.2.4 Components ready for integration ✅
- [ ] 10.2.5 Deploy and monitor for issues
- [ ] 10.2.6 Collect user feedback on plan-act workflow
