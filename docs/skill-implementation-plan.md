# Skill System Implementation Plan

## 1. Relationship Between Skills and Existing Built-in Tools / Workflows

- **Skill is a packaging and orchestration layer for capabilities**, positioned above built-in tools (low-level, callable by LLM) and Workflows (high-risk, user-explicit triggers)
- **Built-in tools** provide atomic tool capabilities; Skills guide LLMs to combine and invoke tools through declared tool dependencies and prompt fragments
- **Workflows** handle user-controllable complex operations; Skills can associate recommended workflows or provide "skill entry points" to trigger Workflows

**Expected Relationship:**
| Layer | Role | Example |
|------|------|------|
| Built-in Tools | Atomic capabilities | read_file, write_file, execute_command |
| Skill | Capability orchestration and strategy | "File Analysis" Skill = read + search + analysis prompt |
| Workflow | User-explicit operations | "Create Project" multi-step form flow |

## 2. New Modules Required

### Backend (Rust)
```
crates/skill_manager/
├── Cargo.toml
└── src/
    ├── lib.rs              # Module entry
    ├── store.rs            # SkillStore implementation
    ├── types.rs            # SkillDefinition and other types
    └── registry.rs         # Skill registry

crates/web_service/src/
├── controllers/
│   └── skill_controller.rs  # GET/POST/PUT/DELETE /v1/skills
└── services/
    └── skill_service.rs     # Business logic layer
```

### Frontend (TypeScript)
```
src/
├── services/
│   └── SkillService.ts      # API wrapper
├── store/slices/
│   └── skillSlice.ts        # Zustand state
├── types/
│   └── skill.ts             # Skill type definitions
└── components/Skill/
    ├── SkillManager.tsx
    ├── SkillEditor.tsx
    └── SkillSelector.tsx
```

## 3. Data Structure Design

### SkillDefinition
```typescript
interface SkillDefinition {
  id: string;                    // Unique identifier (kebab-case)
  name: string;                  // Display name
  description: string;           // Skill description
  category: string;              // Category
  tags: string[];                // Tags

  // Core content
  prompt: string;                // Skill prompt fragment
  tool_refs: string[];           // Built-in tool references ["tool"]
  workflow_refs: string[];       // Associated Workflow names

  // Metadata
  visibility: 'public' | 'private';
  enabled_by_default: boolean;
  version: string;
  created_at: string;
  updated_at: string;
}
```

### SkillStore
```typescript
interface SkillStore {
  // Skill definition storage
  skills: Record<string, SkillDefinition>;

  // Enable status
  enabled_skill_ids: string[];   // Global enable
  chat_overrides: Record<string, string[]>;  // Chat-level override

  // Operations
  listSkills(): SkillDefinition[];
  getSkill(id: string): SkillDefinition | null;
  createSkill(skill: Omit<SkillDefinition, 'id'>): Promise<void>;
  updateSkill(id: string, skill: Partial<SkillDefinition>): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  enableSkill(id: string, chatId?: string): Promise<void>;
  disableSkill(id: string, chatId?: string): Promise<void>;
}
```

## 4. API Design

### Skill Management
| Method | Path | Description |
|------|------|------|
| GET | `/v1/skills` | List all skills |
| GET | `/v1/skills/{id}` | Get skill details |
| POST | `/v1/skills` | Create skill |
| PUT | `/v1/skills/{id}` | Update skill |
| DELETE | `/v1/skills/{id}` | Delete skill |

### Enable Control
| Method | Path | Description |
|------|------|------|
| POST | `/v1/skills/{id}/enable` | Enable skill (supports chat_id parameter) |
| POST | `/v1/skills/{id}/disable` | Disable skill (supports chat_id parameter) |

### Dependency Query
| Method | Path | Description |
|------|------|------|
| GET | `/v1/skills/available-tools` | List available built-in tools |
| GET | `/v1/skills/available-workflows` | List available Workflows |

## 5. Frontend UI Component Planning

### SkillManager Page
- Skill card grid/list view
- Search and category filtering
- Enable/disable toggle
- New skill button

### SkillEditor
- Basic info form (name, description, category)
- Prompt editor (Markdown support)
- Tool selector (multi-select from built-in tools list)
- Workflow association selection
- Import/export JSON

### SkillSelector (Embedded in Chat)
- Skill enable panel in chat configuration drawer
- Display globally enabled skills
- Support chat-level override

### SkillBadge
- Mark which skills were used in chat messages
- Display source skill in tool call results

## 6. Integration with System Prompt

### Backend Enhancer Logic
```rust
// When building system prompt to send to LLM
fn build_system_prompt(enabled_skills: &[SkillDefinition]) -> String {
    let mut prompt = base_system_prompt();

    // Append Skill Context section
    if !enabled_skills.is_empty() {
        prompt.push_str("\n\n## Available Skills\n");
        for skill in enabled_skills {
            prompt.push_str(&format!("- {}: {}\n", skill.name, skill.description));
            prompt.push_str(&format!("  {}\n", skill.prompt));
        }
    }

    // Limit available tool list (optional)
    let allowed_tools: Vec<String> = enabled_skills
        .iter()
        .flat_map(|s| s.tool_refs.clone())
        .collect();

    prompt
}
```

### Integration Points
1. **Global Enable**: `SkillStore.enabled_skill_ids` affects all conversations
2. **Chat Override**: Skill list in chat config overrides global settings
3. **Tool Limiting**: Filter available built-in tools based on enabled skills' `tool_refs`
4. **Workflow Recommendation**: Recommend associated Workflow entry points in conversations

## 7. Implementation Steps

### Phase 1: Basic Capabilities and Data Flow (2 weeks)
- [ ] Create `crates/skill_manager` module
- [ ] Implement SkillStore in-memory storage
- [ ] Implement Skill CRUD API
- [ ] Frontend `SkillService.ts` + `skillSlice`
- [ ] System Prompt enhancer integration (append Skill Context)

### Phase 2: Editor and Dependency Binding (2 weeks)
- [ ] SkillManager list page
- [ ] SkillEditor create/edit functionality
- [ ] Built-in tool selector (link to existing `/v1/skills/available-tools` API)
- [ ] Workflow selector (link to existing `/bodhi/workflows` API)
- [ ] Chat-level skill enable (Chat config integration)

### Phase 3: Capability Deepening and Extension (2 weeks)
- [ ] Skill import/export (JSON format)
- [ ] Preset skill library (built-in common skills)
- [ ] Dependency validation (validate tool_refs/workflow_refs validity)
- [ ] SkillBadge display in chat
- [ ] Usage statistics and recommendation ranking

## 8. Relationship Diagram with Existing System

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  ┌──────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ SkillManager │  │ SkillEditor │  │ ChatController   │   │
│  └──────┬───────┘  └──────┬──────┘  └────────┬─────────┘   │
│         │                 │                   │             │
│  ┌──────▼─────────────────▼───────────────────▼─────────┐  │
│  │               SkillService (API client)               │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                        Backend                              │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  web_service                                          │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐ │ │
│  │  │ skill_ctrl  │  │ skill_svc    │  │ tools_ctrl   │ │ │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘ │ │
│  └─────────┼────────────────┼─────────────────┼─────────┘ │
│            │                │                 │           │
│  ┌─────────▼────────────────▼─────────────────▼─────────┐ │
│  │              skill_manager crate                      │ │
│  │         (SkillStore + SkillRegistry)                  │ │
│  └──────────────────────┬────────────────────────────────┘ │
│                         │                                   │
│  ┌──────────────────────▼────────────────────────────────┐ │
│  │  chat_core (System Prompt Enhancer)                    │ │
│  │  - Inject Skill Context into system prompt             │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 9. Reference Clawdbot Skill Design

Drawing inspiration from `/opt/homebrew/lib/node_modules/clawdbot/skills/` design:

```
skills/
├── skill-name/
│   ├── SKILL.md          # Skill description and trigger conditions (required)
│   ├── scripts/          # Executable scripts (optional)
│   ├── references/       # Reference documents (optional)
│   └── assets/           # Template resources (optional)
```

**Mapping to This Project:**
- `SKILL.md` → `SkillDefinition.prompt` + metadata
- `scripts/` → Can associate Workflows or store script content directly
- `references/` → Can embed into prompt or as standalone resources
