# Context Manager & Session Manager Architecture Refactoring

## Why

随着系统功能的不断增加（文件引用、工具自动循环、多种消息类型、动态System Prompt等），现有的Context Manager和Session Manager架构已经偏离了最初的设计规划，需要重新梳理和强化其核心职责：

1. **Context Manager职责不清晰**：当前Context Manager主要作为数据结构存在，缺乏对复杂对话生命周期的主动管理能力
2. **消息类型处理分散**：文件引用、工具调用、普通消息等处理逻辑分散在多个模块，缺乏统一的消息类型系统
3. **工具调用流程繁琐**：工具调用需要多次手动交互，无法实现智能的自动循环执行
4. **存储结构不合理**：消息和上下文元数据混在一起，导致数据结构庞大，影响性能
5. **Session Manager定位模糊**：当前Session Manager主要处理后端缓存，没有明确管理前端用户会话状态的职责

## What Changes

### Context Manager 核心重构

- **逻辑集中化**：**BREAKING** 将当前分散在 web_service 中的状态机和流式输出逻辑迁移到 context_manager，使其成为真正的核心控制器
- **消息生命周期管理**：Context Manager成为对话生命周期的核心控制器，主动管理消息的创建、解析、处理和存储
- **丰富的内部消息类型系统**：建立详细的内部消息类型枚举，记录所有细节，虽然发给LLM的只有User/Assistant，但内部保留完整信息，支持：
  - 普通文本消息（User/Assistant）
  - 图片消息（Image）- 支持 Vision 识别和 OCR 识别两种模式，可配置切换
  - 文件引用消息（FileReference）- 内部详细记录文件路径、行号、读取时间等
  - 工具调用请求（ToolCallRequest）- 详细记录调用参数、审批状态、执行时间等，支持详细日志
  - 工具执行结果（ToolResult）- 完整的成功/失败状态、输出、错误信息
  - 系统控制消息（SystemControl）- 模式切换、分支切换等内部状态变化
  - 中间处理消息（Processing）- 记录pipeline处理过程
- **智能工具调用循环**：实现自动工具调用循环，无需用户每步确认（可配置）
- **动态System Prompt管理**：根据模式（Plan/Act）和上下文动态调整System Prompt
- **状态机内置于Context Manager**：FSM状态管理完全在context_manager中实现，web_service只做简单的API调用转发
- **流式输出处理**：流式SSE处理逻辑在context_manager中实现，包括chunk的解析、累积、状态更新
- **上下文智能传递**：在流式输出时将完整的Context实体传递给前端，而不仅仅是文本，让前端可以根据Context的状态进行渲染
- **Codebase 工具集成**：提供独立的 codebase 工具系统，让 LLM 可以搜索、查找、读取整个 workspace
- **上下文优化**：智能选择和压缩上下文，设置阈值自动触发或提供用户按钮手动触发，尽可能多地保留对LLM有用的信息
- **存储分离**：将消息内容存储和上下文元数据存储分离，使用多个 JSON 文件代表一个 context，分离不常改动和经常改动的部分，优化性能
- **Branch 合并**：支持不同分支之间的合并操作
- **测试友好**：基于 Context 状态驱动，可以不依赖真实 LLM 进行完整的单元测试和集成测试

### Session Manager 重新定位

- **后端统一管理**：Session Manager 在后端管理所有会话状态，包括用户会话元数据、UI状态等
- **前端无状态化**：前端通过 API 获取会话状态，不独立存储，所有修改通过后端 API 提交
- **多客户端同步**：后端统一管理保证多客户端（Web、Tauri、Mobile）状态自动同步
- **会话状态管理**：后端 Session Manager 管理：
  - 用户的活跃会话列表
  - 最后打开的对话ID
  - 打开的对话标签页列表
  - UI状态（侧边栏、展开/折叠等）
  - 用户偏好（主题、字体大小等）
- **Context 缓存职责保留**：Session Manager 继续负责 ChatContext 的 LRU 缓存，提升性能
- **RESTful API**：提供完整的 CRUD API 供前端操作会话状态
- **状态驱动 UI**：前端基于从后端获取的 Session 状态和 ContextUpdate 驱动 UI 渲染

## Impact

### Affected Specs

- **BREAKING**: `context-manager` - 核心架构重构
- **BREAKING**: `session-manager` - 职责重新定位
- **NEW**: `message-types` - 新的消息类型系统
- **NEW**: `storage-separation` - 存储分离架构

### Affected Code

**Backend (Rust)**:
- `crates/context_manager/src/` - 核心重构
  - `structs/context.rs` - 增强上下文管理能力
  - `structs/message.rs` - 扩展消息类型系统
  - `fsm.rs` - 状态机增强
  - `pipeline/` - 新增消息处理pipeline（新目录）
  - `storage/` - 存储分离实现（新目录）
- `crates/web_service/src/services/session_manager.rs` - 后端会话缓存简化
- `crates/web_service/src/services/chat_service.rs` - 集成新的消息处理流程
- `crates/tool_system/` - 与Context Manager集成以支持自动循环

**Frontend (TypeScript)**:
- `src/store/sessionStore.ts` - 新增前端Session Manager（新文件）
- `src/core/chatInteractionMachine.ts` - 集成新的消息类型系统
- `src/services/` - 适配新的后端API
- `src/hooks/useChatManager.ts` - 使用新的Session Manager

**Storage**:
- 数据库schema变更（如果使用数据库）
- 文件存储结构变更（分离消息和元数据）

### Migration Strategy

1. **Phase 1**: 实现新的消息类型系统，保持向后兼容
2. **Phase 2**: 重构Context Manager的消息处理pipeline
3. **Phase 3**: 实现存储分离，提供数据迁移工具
4. **Phase 4**: 创建前端Session Manager，逐步迁移状态管理
5. **Phase 5**: 实现工具自动循环功能
6. **Phase 6**: 清理旧代码，完成迁移

### Risks

- **数据迁移复杂度**：需要迁移现有对话数据到新的存储结构
- **向后兼容性**：API变更可能影响现有客户端
- **性能影响**：新的架构需要充分测试以确保性能提升
- **开发周期**：这是一个大型重构，需要较长的开发和测试周期

