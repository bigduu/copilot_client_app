## 1. Proposal Validation

- [x] 1.1 Run `openspec validate add-skill-system --strict` and fix all findings
- [x] 1.2 Review and approve proposal

## 2. Backend - Skill Manager Crate

- [x] 2.1 Create `crates/skill_manager/` with Cargo.toml
- [x] 2.2 Define `SkillDefinition` struct (id, name, description, category, tags, prompt, tool_refs, workflow_refs, visibility, enabled_by_default, version, timestamps)
- [x] 2.3 Implement `SkillStore` with in-memory storage + file persistence (~/.bodhi/skills.json)
- [x] 2.4 Implement Skill CRUD operations (create, read, update, delete)
- [x] 2.5 Implement enable/disable logic (global + per-chat)
- [ ] 2.6 Add unit tests for SkillStore operations

## 3. Backend - Web Service Integration

- [x] 3.1 Create `crates/web_service/src/controllers/skill_controller.rs`
  - GET /v1/skills - list all skills
  - GET /v1/skills/{id} - get skill detail
  - POST /v1/skills - create skill
  - PUT /v1/skills/{id} - update skill
  - DELETE /v1/skills/{id} - delete skill
  - POST /v1/skills/{id}/enable - enable skill (with optional chat_id)
  - POST /v1/skills/{id}/disable - disable skill (with optional chat_id)
  - GET /v1/skills/available-tools - list MCP tools for selection
  - GET /v1/skills/available-workflows - list workflows for selection
- [x] 3.2 Create `crates/web_service/src/services/skill_service.rs` - business logic layer
- [x] 3.3 Register skill_controller in `controllers/mod.rs` and server routes
- [ ] 3.4 Add integration tests for skill endpoints

## 4. Backend - System Prompt Integration

- [x] 4.1 Modify `chat_core` or `web_service` to inject Skill Context into system prompt
- [x] 4.2 Implement skill context builder (format: "## Available Skills\n- name: description\n  prompt...")
- [x] 4.3 Support filtering allowed tools based on enabled skills' tool_refs
- [ ] 4.4 Add tests for system prompt enhancement with skills

## 5. Frontend - Skill Service & Store

- [x] 5.1 Create `src/services/SkillService.ts` - API client for skill endpoints
- [x] 5.2 Create `src/types/skill.ts` - TypeScript interfaces matching Rust types
- [x] 5.3 Create `src/store/slices/skillSlice.ts` - Zustand slice for skill state
  - skills: Record<string, SkillDefinition>
  - enabledSkillIds: string[]
  - chatOverrides: Record<string, string[]>
  - loading, error states
- [x] 5.4 Add async thunks: loadSkills, createSkill, updateSkill, deleteSkill, enableSkill, disableSkill

## 6. Frontend - Skill Manager UI

- [ ] 6.1 Create `src/components/Skill/SkillManager.tsx` - main page
  - Grid/list view of skill cards
  - Search bar and category filter
  - Enable/disable toggle per skill
  - "New Skill" button
- [ ] 6.2 Create `src/components/Skill/SkillCard.tsx` - individual skill display
- [ ] 6.3 Add route `/skills` in router configuration
- [ ] 6.4 Add navigation link in sidebar/menu

## 7. Frontend - Skill Editor

- [ ] 7.1 Create `src/components/Skill/SkillEditor.tsx` - create/edit form
  - Basic info: name, description, category, tags
  - Prompt editor (textarea with markdown preview)
  - Tool selector (multi-select from available MCP tools)
  - Workflow selector (multi-select from available workflows)
  - Visibility toggle (public/private)
  - Enabled by default toggle
- [ ] 7.2 Add form validation (required fields, unique id)
- [ ] 7.3 Implement JSON import/export for skill definitions
- [ ] 7.4 Add "Delete" confirmation dialog

## 8. Frontend - Skill Selector in Chat

- [ ] 8.1 Create `src/components/Skill/SkillSelector.tsx` - compact selector for chat config
- [ ] 8.2 Integrate into chat configuration drawer/panel
- [ ] 8.3 Show global enabled skills + allow per-chat override
- [ ] 8.4 Display skill count badge in chat header

## 9. Frontend - Skill Badge

- [ ] 9.1 Create `src/components/Skill/SkillBadge.tsx` - small badge component
- [ ] 9.2 Show skill attribution in chat messages (when skill-triggered)
- [ ] 9.3 Show skill info in tool call results

## 10. Built-in Skills

- [ ] 10.1 Define 3-5 built-in skills as examples
  - File Analysis (read_file + search)
  - Code Review (read_file + diff analysis prompt)
  - Project Setup (workflow triggers)
- [ ] 10.2 Create skills.json seed file
- [ ] 10.3 Auto-create built-in skills on first app start

## 11. End-to-End Validation

- [ ] 11.1 Manual smoke test:
  - Create a new skill
  - Enable/disable globally
  - Enable per-chat
  - Verify system prompt includes skill context
  - Verify tool filtering works
- [ ] 11.2 Test skill import/export
- [ ] 11.3 Test built-in skills auto-creation
- [ ] 11.4 Run full test suite: `cargo test` + `vitest run`

## 12. Documentation

- [ ] 12.1 Update docs/architecture/ with Skill System documentation
- [ ] 12.2 Add user-facing documentation in docs/features/
- [ ] 12.3 Update API documentation
