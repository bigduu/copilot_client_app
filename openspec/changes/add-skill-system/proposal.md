## Why

copilot_client_app 当前提供内置工具调用和 Workflow 用户显式操作，但缺乏一个中间层来编排和组织这些能力。Skill 系统作为能力编排层，可以：

1. **打包相关能力**：将内置工具、Workflow、提示词片段组合成可复用的技能单元
2. **简化用户选择**：用户只需启用 Skill，无需了解底层工具细节
3. **增强 AI 效果**：通过 Skill 的 prompt 片段指导 LLM 更好地组合工具
4. **与 System Prompt 集成**：自动将启用的 Skill 注入到系统提示词中

## What Changes

### Backend
- 新增 `crates/skill_manager/` 模块，提供 Skill 定义存储与管理
- 新增 `skill_controller.rs` 和 `skill_service.rs`，暴露 REST API
- 修改 System Prompt 构建逻辑，追加启用 Skill 的 Context

### Frontend
- 新增 `SkillService.ts` 和 `skillSlice.ts`，管理 Skill 状态
- 新增 SkillManager 页面：列表、搜索、启用/禁用
- 新增 SkillEditor：创建/编辑 Skill，关联内置工具和 Workflow
- 新增 SkillSelector：在 Chat 配置中启用对话级 Skill

### Data Model
- `SkillDefinition`：技能定义（id, name, description, prompt, tool_refs, workflow_refs, enabled_by_default）
- `SkillStore`：存储层（skills map, enabled_skill_ids, chat_overrides）

## Impact

- **Affected crates**: `skill_manager` (new), `web_service`, `chat_core`
- **Affected frontend**: `src/services/`, `src/store/slices/`, `src/components/Skill/` (new)
- **No breaking changes**: 现有 Chat/Workflow API 保持不变
- **Dependencies**: 复用现有内置工具和 Workflow 系统
