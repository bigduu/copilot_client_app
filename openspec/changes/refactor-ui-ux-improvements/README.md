# UI/UX 改进与重构 - 提案总览

## 📋 提案状态

- **Change ID**: `refactor-ui-ux-improvements`
- **状态**: Pending Review (待审核)
- **创建时间**: 2025-11-03
- **预计工作量**: 10-15 天

## 🎯 核心目标

本提案旨在系统性地改进前端 UI/UX,解决以下 9 个主要问题:

1. ✂️ **移除冗余的 Backend Contexts 面板** - 简化界面,移除与 ChatItem 重复的信息
2. 🤖 **实现 AI 标题自动生成** - 为 Chat 生成有意义的标题,而非"main"等默认值
3. 👁️ **增强 System Prompt 预览** - 提供更直观的 Prompt 选择和预览体验
4. 💾 **实现 Chat 记忆功能** - 记住用户上次打开的 Chat,重启后自动恢复
5. 🎨 **优化执行结果展示** - 格式化 JSON、处理换行、区分 Tool(AI 调用)和 Workflow(用户调用)的结果
6. 📁 **扩展文件拖放支持** - 支持文本、代码等多种文件类型,不仅限于图片
7. ✨ **实现 Workflow 命令高亮** - 在输入框中高亮 `/workflowName`,参数部分保持普通样式
8. 🔗 **实现 @ 文件引用** - 输入 `@` 时弹出文件选择器,快速引用文件
9. 🏗️ **前端架构重构** - 优化状态管理、组件职责,提升代码质量

## 📂 文档结构

```
openspec/changes/refactor-ui-ux-improvements/
├── README.md              # 本文件 - 提案总览
├── proposal.md            # 提案详情 - Why, What, Impact
├── design.md              # 技术设计 - 决策、方案、风险
├── tasks.md               # 实施任务清单 - 详细的工作分解
└── specs/                 # Spec 变更
    ├── frontend-ui-layer/
    │   └── spec.md        # UI 层的需求变更
    ├── chat-persistence/
    │   └── spec.md        # Chat 记忆功能需求
    ├── input-enhancements/
    │   └── spec.md        # 输入增强功能需求
    └── message-display/
        └── spec.md        # 消息显示优化需求
```

## 🔍 快速导航

### 阅读建议顺序

1. **了解背景和动机** → `proposal.md` 的 "Why" 部分
2. **查看具体变更** → `proposal.md` 的 "What Changes" 部分
3. **理解技术决策** → `design.md` 的 "Decisions" 部分
4. **查看实施计划** → `tasks.md` 的各个 Phase
5. **深入需求细节** → `specs/` 下的各个 spec 文件

### 关键概念

**重要**: Tool 和 Workflow 是两个不同的概念:

- **Tools (工具)**: 只能由 AI 自主决定调用,用户无法手动触发
- **Workflows (工作流)**: 用户可以手动调用,格式为 `/workflowName 参数`

### 关键决策点

在 `design.md` 中,我们做了以下重要决策:

- **Backend Contexts 移除**: 完全移除,不保留折叠选项
- **标题生成**: 采用后端生成 + 前端更新的方式
- **Chat 记忆**: 使用后端存储(而非 localStorage),支持多端同步
- **执行结果展示**: 创建两个独立组件:
  - `ToolResultCard`: AI Tool 结果展示
  - `WorkflowResultCard`: User Workflow 结果展示
- **文件拖放**: 先支持文本文件,逐步扩展
- **Workflow 命令高亮**: 使用 overlay 方案,只高亮 `/workflowName` 部分,参数不高亮
- **@ 文件引用**: 类似 `WorkflowSelector` 的弹出式选择器

## 🚀 实施计划

### Phase 1: 基础 UI 清理 (1-2 天)

- 移除 Backend Contexts
- 优化 System Prompt 预览
- 实现 Chat 记忆功能

### Phase 2: 消息展示优化 (2-3 天)

- 创建 ToolResultCard 组件
- 实现 JSON 格式化和高亮
- 添加折叠/展开功能

### Phase 3: 输入增强 (3-4 天)

- 扩展文件拖放(文本文件)
- 实现 Workflow 高亮
- 创建 @ 文件引用选择器

### Phase 4: AI 标题生成 (2-3 天)

- 实现后端 API
- 前端调用和状态管理
- 错误处理和加载状态

### Phase 5: 架构重构和优化 (2-3 天)

- 组件职责重新划分
- 性能优化
- 代码清理和文档更新

## 📊 影响范围

### 受影响的规范 (Specs)

- `frontend-ui-layer`: UI 组件的主要变更
- `chat-persistence`: 新增的 Chat 记忆功能
- `input-enhancements`: 输入框的增强功能
- `message-display`: 消息显示的优化

### 受影响的代码文件

**组件 (Components)**:

- `ChatSidebar/index.tsx`
- `SystemPromptSelector/index.tsx`
- `MessageInput/index.tsx`
- `InputContainer/index.tsx`
- `MessageCard/index.tsx`
- `ToolResultCard/index.tsx` (新建)
- `FileReferenceSelector/index.tsx` (新建)

**Hooks**:

- `useChatManager.ts`
- `useDragAndDrop.ts`
- `usePasteHandler.ts`

**Store**:

- `slices/chatSessionSlice.ts`

**Utils** (新建):

- `utils/fileUtils.ts`
- `utils/inputHighlight.ts`

## ⚠️ 风险和缓解措施

### 识别的风险

1. **文件拖放功能复杂度** → 分阶段实现,先支持简单类型
2. **Workflow 高亮性能影响** → 使用防抖,优化计算
3. **AI 标题生成成本** → 只在必要时生成,允许禁用
4. **@ 文件引用权限问题** → Web 环境使用后端 API

### 部署策略

**重要**: 本次重构允许破坏现有数据,简化部署流程:

- ✅ 可以直接替换旧组件
- ✅ 不需要数据迁移
- ✅ 可以清空或重建数据库
- ⚠️ 必须保证所有功能正常工作

### 回滚策略

- 如果发现功能问题,直接回滚代码
- 不需要考虑数据兼容性
- 可以重新初始化数据

## ❓ 待解决问题

在 `design.md` 的 "Open Questions" 中,我们列出了以下需要讨论的问题:

1. AI 标题生成的触发时机(第一条消息?第三条?)
2. 文件上传的大小限制和服务器支持
3. @ 文件引用的格式(路径 vs 特殊标记)
4. Workflow 高亮的优先级和嵌套处理
5. 移动端适配策略

## 📝 下一步

1. **Review**: 请相关人员审查本提案
2. **Discussion**: 讨论 "Open Questions" 中的问题
3. **Approval**: 获得批准后开始实施
4. **Implementation**: 按照 `tasks.md` 中的任务清单逐步实施
5. **Testing**: 每个 Phase 完成后进行测试
6. **Deployment**: 分阶段部署到生产环境

## 📞 联系和反馈

如有任何问题或建议,请通过以下方式联系:

- 在项目中创建 Issue 讨论具体问题
- 在代码审查时提出改进建议
- 通过团队沟通渠道反馈

---

**Validation Status**: ✅ Passed `openspec validate refactor-ui-ux-improvements --strict`
