# UI/UX 改进与重构 - 技术设计

## Context

当前前端实现基于以下技术栈:

- React + TypeScript
- Ant Design (UI 组件库)
- Zustand (状态管理)
- XState (状态机,用于 Chat 交互)
- React Markdown (Markdown 渲染)

项目已经完成了多个重要的重构:

- Backend-first 持久化架构
- Context Manager 迁移
- Plan-Act Agent 架构
- Tool 系统重构

当前需要对前端 UI/UX 进行系统性优化,以提升用户体验和代码质量。

## Goals / Non-Goals

### Goals

1. 提升用户体验,解决已知的 UI 问题
2. 简化界面,移除冗余信息
3. 增强交互功能,提供更多便利特性
4. 优化代码结构,提高可维护性
5. 保持与现有架构的兼容性

### Non-Goals

- 不改变核心的数据流和状态管理架构
- 不涉及后端 API 的大规模重构
- 不改变现有的 Tool/Workflow 执行逻辑

## Decisions

### 1. Backend Contexts 面板移除

**决策**: 完全移除 ChatSidebar 中的 Backend Contexts 部分

**理由**:

- 该信息与 ChatItem 重复
- 增加了界面复杂度
- Backend Context 的概念对普通用户不够友好
- ChatItem 已经提供了足够的信息展示

**替代方案考虑**:

- 保留但隐藏在折叠面板中 → 仍然增加复杂度
- 改名为"会话列表" → 与 ChatItem 仍然重复

### 2. AI 标题生成实现

**决策**: 采用后端生成 + 前端轮询的方式

**技术方案**:

```typescript
// 1. 用户发送消息后,检测是否需要生成标题
// 2. 如果是新 Chat(消息数 <= 3),调用后端 API 生成标题
// 3. 后端使用 LLM 根据对话内容生成简短的标题
// 4. 前端更新 Chat 的 title 字段

interface TitleGenerationRequest {
  context_id: string;
  messages?: Message[]; // 可选,后端可以从 context 中获取
}

interface TitleGenerationResponse {
  title: string;
}
```

**触发时机**:

- 用户发送第一条消息后
- 用户手动点击"生成标题"按钮
- 不在每条消息后都生成,避免过多 API 调用

### 3. System Prompt 预览增强

**决策**: 在现有基础上增强预览功能,而非重新设计

**改进点**:

- 优化 Markdown 渲染,支持代码高亮
- 添加折叠/展开功能,处理长 Prompt
- 显示 Prompt 的使用次数统计
- 提供"复制 Prompt"快捷操作

**实现**:

- 使用现有的 `SystemPromptSelector` 组件
- 增强 Markdown 渲染组件,添加 `react-syntax-highlighter`
- 添加新的 UI 元素,但保持现有布局

### 4. Chat 记忆功能

**决策**: 使用后端存储用户最后打开的 Chat ID,支持多端同步

**理由**:

- 项目可能有多种前端(Web、Desktop App、Mobile 等)
- localStorage 只在单个浏览器中有效,无法跨设备/客户端同步
- 后端统一管理用户偏好,提供一致的体验

**实现**:

```typescript
// 后端 API
// PUT /api/user/preferences
{
  "last_opened_chat_id": "chat-uuid"
}

// GET /api/user/preferences
{
  "last_opened_chat_id": "chat-uuid",
  // ... other preferences
}

// 前端实现
// 在 chatSessionSlice.ts 中
selectChat: async (chatId) => {
  set({ currentChatId: chatId, latestActiveChatId: chatId });

  // 异步保存到后端,不阻塞 UI
  try {
    await UserPreferenceService.updatePreference({
      last_opened_chat_id: chatId
    });
  } catch (error) {
    console.warn('Failed to save chat preference:', error);
    // 不影响用户体验,静默失败
  }
},

// 恢复
loadChats: async () => {
  // ... 加载 chats 后
  try {
    const prefs = await UserPreferenceService.getPreferences();
    const lastChatId = prefs.last_opened_chat_id;

    if (lastChatId && chats.some(c => c.id === lastChatId)) {
      set({ currentChatId: lastChatId });
    } else if (chats.length > 0) {
      set({ currentChatId: chats[0].id });
    }
  } catch (error) {
    // 如果获取失败,使用兜底逻辑
    if (chats.length > 0) {
      set({ currentChatId: chats[0].id });
    }
  }
}
```

**优势**:

- 跨设备/客户端同步
- 统一的用户体验
- 为未来的多端支持做准备

**替代方案被否决**:

- ❌ 使用 localStorage → 无法跨设备,不支持多种前端
- ❌ 使用 sessionStorage → 关闭浏览器后丢失

### 5. Tool/Workflow 结果显示优化

**决策**: 创建两个独立的组件,分别处理 Tool 和 Workflow 的执行结果

**背景**:

- **Tools**: 由 AI 自主调用,用户无法手动触发
- **Workflows**: 用户通过 `/workflowName 参数` 手动调用
- 两者虽然都产生执行结果,但展示需求和交互方式不同

**为什么分开而不是统一?**

- Tool 和 Workflow 的用户交互模式不同
- 未来可能有不同的扩展需求
- 代码职责更清晰,易于维护
- 可以针对各自特点优化 UI

**ToolResultCard 组件**:

```typescript
interface ToolResultCardProps {
  content: string;
  toolName: string;
  status: "success" | "error" | "warning";
  timestamp?: string;
}

// 特点:
// - 显示"AI Tool"标签和机器人图标
// - 不提供重试按钮(由 AI 决定)
// - 强调这是 AI 自主决策的结果
```

**WorkflowResultCard 组件**:

```typescript
interface WorkflowResultCardProps {
  content: string;
  workflowName: string;
  parameters?: string; // 用户输入的参数
  status: "success" | "error" | "warning";
  timestamp?: string;
  onRetry?: () => void; // 重试回调
}

// 特点:
// - 显示"User Workflow"标签和齿轮图标
// - 显示用户输入的参数
// - 提供重试按钮(用户可重新执行)
// - 强调这是用户主动触发的操作
```

**共同功能**(通过共享的 utility 函数实现):

- JSON 检测和格式化
- 语法高亮
- 折叠/展开大型结果
- 复制结果到剪贴板

### 6. 文件拖放/粘贴扩展

**决策**: 扩展现有的 hooks,支持多种文件类型

**支持的文件类型**:

- 文本文件: .txt, .md, .log
- 代码文件: .js, .ts, .py, .java, .cpp 等
- 文档: .pdf, .doc, .docx(可能需要后端支持)
- 配置文件: .json, .yaml, .toml

**实现**:

```typescript
// 扩展 useDragAndDrop 和 usePasteHandler
interface FileHandlerOptions {
  onFiles: (files: ProcessedFile[]) => void;
  allowedTypes: string[]; // MIME types
  maxSizeBytes: number;
}

interface ProcessedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string; // 对于文本文件,提取内容
  preview?: string; // 预览信息
}
```

**文件处理**:

- 小文本文件(<100KB): 直接读取内容并发送
- 大文件或二进制文件: 上传到服务器,发送文件引用
- 图片: 保持现有的 base64 编码方式

### 7. Workflow 命令高亮实现

**决策**: 使用 overlay 实现 Workflow 命令的高亮显示

**背景**:

- 用户通过 `/workflowName 参数` 格式手动调用 Workflow
- 需要高亮 `/workflowName` 部分,与参数区分
- 参数部分保持普通样式,便于用户编辑

**方案 A: 使用 `ContentEditable` + overlay**

- 保持 TextArea 作为实际输入
- 在上层叠加一个透明的 div,显示高亮效果
- 复杂度较高,但不改变输入行为

**方案 B: 使用富文本编辑器(如 Slate.js)**

- 完全的富文本支持
- 可以实现更复杂的格式化
- 学习曲线较陡,可能影响现有功能

**最终决策**: 方案 A,使用 overlay 实现

- 保持现有输入框的行为
- 只在视觉上添加高亮效果(仅 `/workflowName` 部分)
- 实现相对简单,风险较低

**实现细节**:

```typescript
// 正则识别: /(\/)([a-zA-Z0-9_-]+)(\s|$)/
// 只高亮 Workflow 名称部分,不包括后面的参数
// 例如: "/analyze some code" → 只高亮 "/analyze"
```

### 8. @ 文件引用功能

**决策**: 创建 `FileReferenceSelector` 组件,类似于 `WorkflowSelector`

**实现**:

```typescript
interface FileReferenceSelectorProps {
  visible: boolean;
  onSelect: (filePath: string) => void;
  onCancel: () => void;
  searchText: string;
  currentDirectory?: string;
}

// 功能:
// 1. 监听 @ 字符输入
// 2. 弹出文件选择器
// 3. 支持文件名搜索
// 4. 键盘导航(↑↓ 选择, Enter 确认)
// 5. 插入文件路径或 @filename 标记
```

**文件列表获取**:

- 如果是 Tauri 应用: 使用 Tauri 文件系统 API
- 如果是 Web 应用: 需要后端提供文件列表 API
- 支持缓存,避免频繁请求

### 9. 架构重构原则

**组件职责划分**:

- `InputContainer`: 只负责输入区域的布局和基础交互
- `MessageInput`: 专注于文本输入和基础验证
- `WorkflowSelector`, `FileReferenceSelector`: 独立的弹出选择器
- `MessageCard`: 负责消息渲染,委托给子组件处理不同类型

**状态管理优化**:

- 减少组件内部的 local state
- 将共享状态提升到 Zustand store
- 使用 Context API 传递不经常变化的配置

**性能优化**:

- 使用 `React.memo` 避免不必要的重渲染
- 大列表使用虚拟滚动(如果需要)
- 图片和文件预览使用懒加载

## Risks / Trade-offs

### 风险

1. **文件拖放功能复杂度**
   - 不同文件类型的处理逻辑差异大
   - 可能需要后端支持
   - 缓解: 分阶段实现,先支持文本文件

2. **Workflow 高亮可能影响输入性能**
   - overlay 方案需要同步滚动和定位
   - 缓解: 使用防抖,减少计算频率

3. **AI 标题生成的成本**
   - 每次生成都需要调用 LLM
   - 缓解: 只在必要时生成,允许用户禁用

4. **@ 文件引用需要文件系统访问权限**
   - Web 环境下有限制
   - 缓解: 使用后端 API 提供文件列表

### Trade-offs

1. **功能丰富 vs 简洁**
   - 增加了多个新功能,可能使界面变复杂
   - 决策: 通过渐进式展示和良好的 UX 设计平衡

2. **性能 vs 体验**
   - 富文本高亮、文件预览等功能可能影响性能
   - 决策: 使用懒加载和优化算法,确保流畅体验

3. **统一组件 vs 分离组件**
   - ToolResultCard 和 WorkflowResultCard 可以统一,但我们选择分离
   - 决策: 分离提供更好的扩展性和职责清晰度,代价是稍多的代码

4. **后端依赖 vs 本地优先**
   - Chat 记忆使用后端存储,增加了后端依赖
   - 决策: 后端存储是必要的,因为需要支持多种前端客户端

## Migration Plan

**重要说明**: 本次重构可以破坏现有数据,不需要做数据迁移,只需保证功能正常工作。

### Phase 1: 基础 UI 清理 (1-2 天)

1. 移除 Backend Contexts 面板
2. 优化 System Prompt 预览
3. 实现 Chat 记忆功能(后端 API)

### Phase 2: 消息展示优化 (2-3 天)

1. 创建 ToolResultCard 和 WorkflowResultCard 组件
2. 实现 JSON 格式化和高亮
3. 添加折叠/展开功能

### Phase 3: 输入增强 (3-4 天)

1. 扩展文件拖放支持(文本文件)
2. 实现 Workflow 命令高亮
3. 创建 @ 文件引用选择器

### Phase 4: AI 标题生成 (2-3 天)

1. 实现后端 API
2. 前端调用和状态管理
3. 错误处理和加载状态

### Phase 5: 架构重构和优化 (2-3 天)

1. 组件职责重新划分
2. 性能优化
3. 代码清理和文档更新

**总计**: 约 10-15 天

### Deployment Strategy

- 直接部署,不需要 feature flags
- 可以直接替换旧组件
- **数据层面**: 可以清空或重建数据库(如果需要)
- **功能层面**: 所有功能必须正常工作

### Rollback Strategy

- 如果发现功能问题,回滚代码即可
- 不需要考虑数据兼容性
- 可以重新初始化数据

## Open Questions

1. **AI 标题生成的触发时机**
   - 第一条消息后?第三条消息后?
   - 是否需要用户手动确认?

2. **文件上传的大小限制**
   - 多大的文件应该上传到服务器而非直接发送?
   - 服务器是否支持文件存储?

3. **@ 文件引用的格式**
   - 是简单的文件路径?还是特殊的标记格式?
   - 如何在消息中区分文件引用和普通 @ 符号?

4. **Workflow 命令的参数处理**
   - `/workflowName` 后的参数如何传递给 Workflow?
   - 参数是原样传递还是由 AI 进一步处理?
   - 如果输入包含多个 `/`,如何识别哪个是 Workflow?

5. **移动端适配**
   - 这些新功能在移动端如何展示?
   - 是否需要针对移动端做特殊优化?
