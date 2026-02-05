# Skill System Implementation Plan

## 1. Skill 与现有内置工具 / Workflow 的关系

- **Skill 是对能力的打包与编排层**，位于内置工具 (低层、可被 LLM 调用) 与 Workflow (高风险、用户显式触发) 之上
- **内置工具** 负责提供原子工具能力，Skill 通过声明工具依赖与提示词片段，指导 LLM 组合与调用工具
- **Workflow** 负责用户可控的复杂操作，Skill 可以关联推荐工作流或提供"技能入口"来触发 Workflow

**预期关系：**
| 层级 | 角色 | 示例 |
|------|------|------|
| 内置工具 | 原子能力 | read_file, write_file, execute_command |
| Skill | 能力编排与策略 | "文件分析" Skill = read + search + 分析提示词 |
| Workflow | 用户显式操作 | "创建项目" 多步骤表单流程 |

## 2. 需要新增的模块

### Backend (Rust)
```
crates/skill_manager/
├── Cargo.toml
└── src/
    ├── lib.rs              # 模块入口
    ├── store.rs            # SkillStore 实现
    ├── types.rs            # SkillDefinition 等类型
    └── registry.rs         # 技能注册表

crates/web_service/src/
├── controllers/
│   └── skill_controller.rs  # GET/POST/PUT/DELETE /v1/skills
└── services/
    └── skill_service.rs     # 业务逻辑层
```

### Frontend (TypeScript)
```
src/
├── services/
│   └── SkillService.ts      # API 封装
├── store/slices/
│   └── skillSlice.ts        # Zustand state
├── types/
│   └── skill.ts             # Skill 类型定义
└── components/Skill/
    ├── SkillManager.tsx
    ├── SkillEditor.tsx
    └── SkillSelector.tsx
```

## 3. 数据结构设计

### SkillDefinition
```typescript
interface SkillDefinition {
  id: string;                    // 唯一标识 (kebab-case)
  name: string;                  // 显示名称
  description: string;           // 技能描述
  category: string;              // 分类
  tags: string[];                // 标签
  
  // 核心内容
  prompt: string;                // 技能提示词片段
  tool_refs: string[];           // 内置工具引用 ["tool"]
  workflow_refs: string[];       // 关联 Workflow 名称
  
  // 元数据
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
  // 技能定义存储
  skills: Record<string, SkillDefinition>;
  
  // 启用状态
  enabled_skill_ids: string[];   // 全局启用
  chat_overrides: Record<string, string[]>;  // 对话级覆盖
  
  // 操作
  listSkills(): SkillDefinition[];
  getSkill(id: string): SkillDefinition | null;
  createSkill(skill: Omit<SkillDefinition, 'id'>): Promise<void>;
  updateSkill(id: string, skill: Partial<SkillDefinition>): Promise<void>;
  deleteSkill(id: string): Promise<void>;
  enableSkill(id: string, chatId?: string): Promise<void>;
  disableSkill(id: string, chatId?: string): Promise<void>;
}
```

## 4. API 设计

### Skill 管理
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/v1/skills` | 列出所有技能 |
| GET | `/v1/skills/{id}` | 获取技能详情 |
| POST | `/v1/skills` | 创建技能 |
| PUT | `/v1/skills/{id}` | 更新技能 |
| DELETE | `/v1/skills/{id}` | 删除技能 |

### 启用控制
| 方法 | 路径 | 描述 |
|------|------|------|
| POST | `/v1/skills/{id}/enable` | 启用技能 (支持 chat_id 参数) |
| POST | `/v1/skills/{id}/disable` | 禁用技能 (支持 chat_id 参数) |

### 依赖查询
| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/v1/skills/available-tools` | 列出可用的内置工具 |
| GET | `/v1/skills/available-workflows` | 列出可用的 Workflows |

## 5. 前端 UI 组件规划

### SkillManager 页面
- 技能卡片网格/列表视图
- 搜索与分类筛选
- 启用/禁用开关
- 新建技能按钮

### SkillEditor
- 基本信息表单 (名称、描述、分类)
- 提示词编辑器 (Markdown 支持)
- 工具选择器 (从内置工具列表多选)
- Workflow 关联选择
- 导入/导出 JSON

### SkillSelector (嵌入 Chat)
- 对话配置抽屉中的技能启用面板
- 显示全局启用的技能
- 支持对话级覆盖

### SkillBadge
- 在聊天消息中标记使用了哪些技能
- 在工具调用结果中显示来源技能

## 6. 与 System Prompt 的集成方式

### 后端增强器逻辑
```rust
// 在构建发送到 LLM 的系统提示词时
fn build_system_prompt(enabled_skills: &[SkillDefinition]) -> String {
    let mut prompt = base_system_prompt();
    
    // 追加 Skill Context 段落
    if !enabled_skills.is_empty() {
        prompt.push_str("\n\n## Available Skills\n");
        for skill in enabled_skills {
            prompt.push_str(&format!("- {}: {}\n", skill.name, skill.description));
            prompt.push_str(&format!("  {}\n", skill.prompt));
        }
    }
    
    // 限制可用工具列表 (可选)
    let allowed_tools: Vec<String> = enabled_skills
        .iter()
        .flat_map(|s| s.tool_refs.clone())
        .collect();
    
    prompt
}
```

### 集成点
1. **全局启用**：`SkillStore.enabled_skill_ids` 影响所有对话
2. **对话覆盖**：chat config 中的技能列表覆盖全局设置
3. **工具限制**：根据启用技能的 `tool_refs` 过滤可用内置工具
4. **Workflow 推荐**：在对话中推荐关联的 Workflow 入口

## 7. 实施步骤

### 阶段 1：基础能力与数据流 (2周)
- [ ] 创建 `crates/skill_manager` 模块
- [ ] 实现 SkillStore 内存存储
- [ ] 实现 Skill CRUD API
- [ ] 前端 `SkillService.ts` + `skillSlice`
- [ ] System Prompt 增强器集成 (追加 Skill Context)

### 阶段 2：编辑器与依赖绑定 (2周)
- [ ] SkillManager 列表页面
- [ ] SkillEditor 创建/编辑功能
- [ ] 内置工具选择器 (关联现有 `/v1/skills/available-tools` API)
- [ ] Workflow 选择器 (关联现有 `/bodhi/workflows` API)
- [ ] 对话级技能启用 (Chat config 集成)

### 阶段 3：能力深化与扩展 (2周)
- [ ] 技能导入/导出 (JSON 格式)
- [ ] 预置技能库 (内置常用技能)
- [ ] 依赖校验 (验证 tool_refs/workflow_refs 有效性)
- [ ] SkillBadge 在聊天中的展示
- [ ] 使用统计与推荐排序

## 8. 与现有系统的关系图

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
│  │  - 注入 Skill Context 到系统提示词                     │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 9. 参考 Clawdbot Skill 设计

借鉴 `/opt/homebrew/lib/node_modules/clawdbot/skills/` 的设计：

```
skills/
├── skill-name/
│   ├── SKILL.md          # 技能描述与触发条件 (必需)
│   ├── scripts/          # 可执行脚本 (可选)
│   ├── references/       # 参考文档 (可选)
│   └── assets/           # 模板资源 (可选)
```

**映射到本项目：**
- `SKILL.md` → `SkillDefinition.prompt` + metadata
- `scripts/` → 可关联 Workflow 或直接存储脚本内容
- `references/` → 可嵌入到 prompt 或作为独立资源
