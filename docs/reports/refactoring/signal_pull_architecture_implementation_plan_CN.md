# Signal-Pull 架构实施计划

**日期**: 2025-11-08  
**状态**: 设计锁定，开始实施  
**架构**: 上下文本地消息池 + 信令-拉取同步模型

---

## ✅ 已完成任务

### 1. Design 文档更新 ✅

已添加两个关键决策到 `design.md`:

#### Decision 3.1: Context-Local Message Pool
- **存储结构**: `contexts/{ctx_id}/messages_pool/`
- **关键特性**: 
  - 每个 Context 完全自包含
  - 分支操作零文件 I/O
  - 无需垃圾回收
- **文件位置**: design.md:1086-1181

#### Decision 4.5.1: Signal-Pull Synchronization Model
- **SSE 信令**: 只推送轻量级通知（< 1KB）
- **REST 拉取**: 前端主动获取数据
- **自愈机制**: 通过序列号自动修复丢失的信令
- **文件位置**: design.md:1296-1506

### 2. OpenSpec 验证 ✅

```bash
$ openspec validate refactor-context-session-architecture --strict
✅ Change 'refactor-context-session-architecture' is valid
```

---

## 🚧 待实施任务

根据用户确认的设计，以下是详细的实施计划：

### Phase 1.5: StreamingResponse & Signal-Pull Infrastructure

#### Task 1.5.1: 扩展 MessageMetadata ⏳

**目标**: 添加消息来源和流式元数据字段

**文件**: `crates/context_manager/src/structs/metadata.rs`

**新增结构**:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MessageMetadata {
    // 现有字段
    pub created_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub tokens: Option<TokenUsage>,
    
    // ✨ 新增字段
    /// 消息来源（用户输入 vs AI生成 vs 工具结果）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<MessageSource>,
    
    /// 前端展示提示
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_hint: Option<DisplayHint>,
    
    /// 流式响应元数据（如果是 StreamingResponse）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming: Option<StreamingMetadata>,
    
    /// 前端原始输入（用于回显）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_input: Option<String>,
    
    /// 追踪 ID（前后端关联）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
    
    // 保留扩展字段
    pub extra: Option<HashMap<String, Value>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MessageSource {
    UserInput,
    UserFileReference,
    UserWorkflow,
    UserImageUpload,
    AIGenerated,
    ToolExecution,
    SystemControl,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct DisplayHint {
    /// 前端展示的缩略文本
    pub summary: Option<String>,
    /// 是否折叠显示
    pub collapsed: bool,
    /// 图标提示
    pub icon: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct StreamingMetadata {
    pub chunks_count: usize,
    pub started_at: DateTime<Utc>,
    pub completed_at: DateTime<Utc>,
    pub total_duration_ms: u64,
    pub average_chunk_interval_ms: Option<f64>,
}
```

**测试**:
- `test_message_source_serialization`
- `test_display_hint_defaults`
- `test_streaming_metadata_calculation`

---

#### Task 1.5.2: 实现 StreamingResponse 消息类型 ⏳

**目标**: 添加专门的流式响应消息类型

**文件**: `crates/context_manager/src/structs/message_types.rs`

**新增内容**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RichMessageType {
    // ... 现有类型
    
    /// 流式响应消息（LLM 流式生成的完整记录）
    StreamingResponse(StreamingResponseMsg),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamingResponseMsg {
    /// 完整的最终内容
    pub content: String,
    
    /// 流式块序列（按时间顺序）
    pub chunks: Vec<StreamChunk>,
    
    /// 流式开始时间
    pub started_at: DateTime<Utc>,
    
    /// 流式完成时间
    pub completed_at: DateTime<Utc>,
    
    /// 总耗时（毫秒）
    pub total_duration_ms: u64,
    
    /// LLM 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    
    /// Token 使用情况
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,
    
    /// 完成原因（stop, length, tool_calls 等）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamChunk {
    /// 块序列号（从 0 开始）
    pub sequence: u64,
    
    /// 增量内容（delta）
    pub delta: String,
    
    /// 块接收时间
    pub timestamp: DateTime<Utc>,
    
    /// 到此块为止的累积字符数
    pub accumulated_chars: usize,
    
    /// 与上一块的时间间隔（毫秒）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_ms: Option<u64>,
}

impl StreamingResponseMsg {
    pub fn new(model: Option<String>) -> Self {
        let now = Utc::now();
        Self {
            content: String::new(),
            chunks: Vec::new(),
            started_at: now,
            completed_at: now,
            total_duration_ms: 0,
            model,
            usage: None,
            finish_reason: None,
        }
    }
    
    pub fn append_chunk(&mut self, delta: String) {
        let sequence = self.chunks.len() as u64;
        let timestamp = Utc::now();
        
        let interval_ms = if let Some(last_chunk) = self.chunks.last() {
            Some((timestamp - last_chunk.timestamp).num_milliseconds() as u64)
        } else {
            None
        };
        
        self.content.push_str(&delta);
        
        self.chunks.push(StreamChunk {
            sequence,
            delta,
            timestamp,
            accumulated_chars: self.content.len(),
            interval_ms,
        });
    }
    
    pub fn finalize(&mut self, finish_reason: Option<String>, usage: Option<TokenUsage>) {
        self.completed_at = Utc::now();
        self.total_duration_ms = (self.completed_at - self.started_at)
            .num_milliseconds() as u64;
        self.finish_reason = finish_reason;
        self.usage = usage;
    }
}
```

**测试**:
- `test_streaming_response_creation`
- `test_append_chunk_sequence`
- `test_finalize_calculates_duration`
- `test_chunk_interval_calculation`

---

#### Task 1.5.3: Context 集成流式处理 ⏳

**目标**: 在 ChatContext 中添加流式处理方法

**文件**: `crates/context_manager/src/structs/context_lifecycle.rs`

**新增方法**:

```rust
impl ChatContext {
    /// 开始流式响应（创建消息引用）
    pub fn begin_streaming_llm_response(&mut self, model: Option<String>) -> Result<Uuid> {
        // 创建消息 ID
        let message_id = Uuid::new_v4();
        
        // 创建 StreamingResponse
        let streaming_msg = StreamingResponseMsg::new(model);
        let internal_msg = InternalMessage::from_rich(
            Role::Assistant,
            RichMessageType::StreamingResponse(streaming_msg)
        );
        
        // 添加到 message_pool
        let msg_node = MessageNode {
            id: message_id,
            message: internal_msg,
            parent_id: self.get_active_branch().message_ids.last().copied(),
        };
        
        self.message_pool.insert(message_id, msg_node);
        self.get_active_branch_mut().message_ids.push(message_id);
        
        // 状态转换
        self.current_state = ContextState::StreamingLLMResponse { 
            chunks_received: 0,
            chars_accumulated: 0 
        };
        
        self.mark_dirty();
        Ok(message_id)
    }
    
    /// 追加流式块
    pub fn append_streaming_chunk(&mut self, message_id: Uuid, delta: String) -> Result<u64> {
        let msg_node = self.message_pool.get_mut(&message_id)
            .ok_or_else(|| anyhow!("Message not found: {}", message_id))?;
        
        // 更新 StreamingResponse
        if let Some(RichMessageType::StreamingResponse(streaming)) = &mut msg_node.message.rich_type {
            streaming.append_chunk(delta);
            
            // 更新状态
            self.current_state = ContextState::StreamingLLMResponse {
                chunks_received: streaming.chunks.len(),
                chars_accumulated: streaming.content.len(),
            };
            
            self.mark_dirty();
            
            // 返回当前序列号
            Ok(streaming.chunks.len() as u64)
        } else {
            Err(anyhow!("Message is not a StreamingResponse"))
        }
    }
    
    /// 完成流式响应
    pub fn finalize_streaming_response(
        &mut self, 
        message_id: Uuid,
        finish_reason: Option<String>,
        usage: Option<TokenUsage>,
    ) -> Result<()> {
        let msg_node = self.message_pool.get_mut(&message_id)
            .ok_or_else(|| anyhow!("Message not found: {}", message_id))?;
        
        if let Some(RichMessageType::StreamingResponse(streaming)) = &mut msg_node.message.rich_type {
            streaming.finalize(finish_reason, usage);
            
            // 更新 metadata
            if let Some(metadata) = &mut msg_node.message.metadata {
                metadata.streaming = Some(StreamingMetadata {
                    chunks_count: streaming.chunks.len(),
                    started_at: streaming.started_at,
                    completed_at: streaming.completed_at,
                    total_duration_ms: streaming.total_duration_ms,
                    average_chunk_interval_ms: streaming.chunks.iter()
                        .filter_map(|c| c.interval_ms)
                        .map(|ms| ms as f64)
                        .sum::<f64>()
                        .checked_div((streaming.chunks.len() - 1) as f64),
                });
            }
        }
        
        // 状态转换
        self.current_state = ContextState::ProcessingLLMResponse;
        self.mark_dirty();
        
        Ok(())
    }
}
```

**测试**:
- `test_begin_streaming_creates_message`
- `test_append_chunk_updates_state`
- `test_finalize_updates_metadata`
- `test_streaming_integration_flow`

---

#### Task 1.5.4: 实现 REST API 端点 ⏳

**目标**: 实现 Signal-Pull 模型的 REST API

**文件**: `crates/web_service/src/routes/context_routes.rs`, `message_routes.rs`

**新增端点**:

##### 1. GET /contexts/{id}

```rust
#[derive(Serialize)]
struct ContextMetadataResponse {
    context_id: Uuid,
    current_state: ContextState,
    active_branch: String,
    branches: HashMap<String, BranchInfo>,
    config: ContextConfig,
}

#[get("/contexts/{context_id}")]
async fn get_context_metadata(
    context_id: Path<Uuid>,
    context_manager: Data<Arc<ContextManager>>,
) -> Result<Json<ContextMetadataResponse>> {
    let context = context_manager.load_context(*context_id).await?;
    
    Ok(Json(ContextMetadataResponse {
        context_id: context.id,
        current_state: context.current_state,
        active_branch: context.active_branch_name,
        branches: context.branches.iter().map(|(name, branch)| {
            (name.clone(), BranchInfo {
                name: branch.name.clone(),
                message_ids: branch.message_ids.clone(),
                parent_branch: branch.parent_branch.clone(),
            })
        }).collect(),
        config: context.config,
    }))
}
```

##### 2. GET /contexts/{id}/messages?ids={...}

```rust
#[derive(Deserialize)]
struct BatchMessageQuery {
    ids: String,  // 逗号分隔的 UUID
}

#[get("/contexts/{context_id}/messages")]
async fn get_messages_batch(
    context_id: Path<Uuid>,
    query: Query<BatchMessageQuery>,
    storage: Data<Arc<MessageStorage>>,
) -> Result<Json<Vec<InternalMessage>>> {
    let message_ids: Vec<Uuid> = query.ids
        .split(',')
        .filter_map(|id| Uuid::parse_str(id.trim()).ok())
        .collect();
    
    let messages = storage.get_messages_batch(*context_id, &message_ids).await?;
    
    Ok(Json(messages))
}
```

##### 3. GET /contexts/{id}/messages/{msg_id}/content

```rust
#[derive(Deserialize)]
struct ContentQuery {
    from_sequence: Option<u64>,
}

#[derive(Serialize)]
struct ContentChunk {
    sequence: u64,
    delta: String,
}

#[get("/contexts/{context_id}/messages/{message_id}/content")]
async fn get_message_content_incremental(
    path: Path<(Uuid, Uuid)>,
    query: Query<ContentQuery>,
    storage: Data<Arc<MessageStorage>>,
) -> Result<Json<Vec<ContentChunk>>> {
    let (context_id, message_id) = path.into_inner();
    let from_sequence = query.from_sequence.unwrap_or(0);
    
    let message = storage.get_message(context_id, message_id).await?;
    
    // 如果是 StreamingResponse，返回增量块
    if let Some(RichMessageType::StreamingResponse(streaming)) = message.rich_type {
        let chunks: Vec<ContentChunk> = streaming.chunks
            .into_iter()
            .filter(|chunk| chunk.sequence > from_sequence)
            .map(|chunk| ContentChunk {
                sequence: chunk.sequence,
                delta: chunk.delta,
            })
            .collect();
        
        Ok(Json(chunks))
    } else {
        // 非流式消息，返回完整内容
        let content = message.content.iter()
            .filter_map(|part| part.text_content())
            .collect::<Vec<_>>()
            .join("\n");
        
        Ok(Json(vec![ContentChunk {
            sequence: 1,
            delta: content,
        }]))
    }
}
```

**测试**:
- `test_get_context_metadata`
- `test_batch_get_messages`
- `test_incremental_content_pull`
- `test_content_pull_with_sequence`

---

#### Task 1.5.5: 实现 SSE 信令推送 ⏳

**目标**: 实现轻量级的 SSE 信令通道

**文件**: `crates/web_service/src/routes/sse_routes.rs`

**实现**:

```rust
use actix_web::{get, web::{Data, Path}, HttpResponse};
use actix_web_lab::sse::{self, Sse};
use futures_util::stream;
use tokio::sync::broadcast;

#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum SSESignal {
    StateChanged {
        state: ContextState,
    },
    MessageCreated {
        message_id: Uuid,
        role: String,
    },
    ContentDelta {
        message_id: Uuid,
        sequence: u64,
    },
    MessageCompleted {
        message_id: Uuid,
        final_sequence: u64,
    },
    Error {
        error_message: String,
    },
}

#[get("/contexts/{context_id}/stream")]
async fn context_sse_stream(
    context_id: Path<Uuid>,
    broadcast_tx: Data<broadcast::Sender<(Uuid, SSESignal)>>,
) -> Sse<impl futures_util::Stream<Item = Result<sse::Event, std::io::Error>>> {
    let context_id = *context_id;
    let mut rx = broadcast_tx.subscribe();
    
    let stream = stream::unfold(rx, move |mut rx| async move {
        loop {
            match rx.recv().await {
                Ok((ctx_id, signal)) if ctx_id == context_id => {
                    // 只推送属于这个 Context 的信令
                    let json = serde_json::to_string(&signal).ok()?;
                    let event = sse::Event::Data(sse::Data::new(json));
                    return Some((Ok(event), rx));
                }
                Ok(_) => continue,  // 忽略其他 Context 的信令
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // 客户端太慢，跳过一些信令（没关系，会自动修复）
                    continue;
                }
                Err(_) => return None,
            }
        }
    });
    
    Sse::from_stream(stream)
}

// 在 Context 中发送信令
impl ChatContext {
    pub fn send_signal(&self, signal: SSESignal, broadcast_tx: &broadcast::Sender<(Uuid, SSESignal)>) {
        let _ = broadcast_tx.send((self.id, signal));
    }
}
```

**测试**:
- `test_sse_connection`
- `test_signal_filtering`
- `test_lagged_client_handling`

---

#### Task 1.5.6: 存储层实现 ⏳

**目标**: 实现 Context-Local Message Pool 存储

**文件**: `crates/context_manager/src/storage/message_storage.rs`

**实现**:

```rust
use std::path::{Path, PathBuf};
use tokio::fs;
use uuid::Uuid;

pub struct FileSystemMessageStorage {
    base_path: PathBuf,
}

impl FileSystemMessageStorage {
    pub fn new(base_path: PathBuf) -> Self {
        Self { base_path }
    }
    
    fn context_dir(&self, context_id: Uuid) -> PathBuf {
        self.base_path.join("contexts").join(context_id.to_string())
    }
    
    fn messages_pool_dir(&self, context_id: Uuid) -> PathBuf {
        self.context_dir(context_id).join("messages_pool")
    }
    
    fn message_path(&self, context_id: Uuid, message_id: Uuid) -> PathBuf {
        self.messages_pool_dir(context_id).join(format!("{}.json", message_id))
    }
    
    fn metadata_path(&self, context_id: Uuid) -> PathBuf {
        self.context_dir(context_id).join("metadata.json")
    }
    
    // 保存消息
    pub async fn save_message(
        &self, 
        context_id: Uuid, 
        message_id: Uuid, 
        message: &InternalMessage
    ) -> Result<()> {
        let path = self.message_path(context_id, message_id);
        fs::create_dir_all(path.parent().unwrap()).await?;
        
        let json = serde_json::to_string_pretty(message)?;
        fs::write(path, json).await?;
        
        Ok(())
    }
    
    // 获取消息
    pub async fn get_message(
        &self, 
        context_id: Uuid, 
        message_id: Uuid
    ) -> Result<InternalMessage> {
        let path = self.message_path(context_id, message_id);
        let json = fs::read_to_string(path).await?;
        let message = serde_json::from_str(&json)?;
        Ok(message)
    }
    
    // 批量获取
    pub async fn get_messages_batch(
        &self, 
        context_id: Uuid, 
        message_ids: &[Uuid]
    ) -> Result<Vec<InternalMessage>> {
        let mut messages = Vec::new();
        for id in message_ids {
            if let Ok(msg) = self.get_message(context_id, *id).await {
                messages.push(msg);
            }
        }
        Ok(messages)
    }
    
    // 保存 metadata
    pub async fn save_metadata(
        &self, 
        context_id: Uuid, 
        metadata: &ContextMetadata
    ) -> Result<()> {
        let path = self.metadata_path(context_id);
        fs::create_dir_all(path.parent().unwrap()).await?;
        
        let json = serde_json::to_string_pretty(metadata)?;
        fs::write(path, json).await?;
        
        Ok(())
    }
    
    // 删除 Context（一步完成，无需 GC）
    pub async fn delete_context(&self, context_id: Uuid) -> Result<()> {
        let dir = self.context_dir(context_id);
        if dir.exists() {
            fs::remove_dir_all(dir).await?;
        }
        Ok(())
    }
}
```

**测试**:
- `test_save_and_get_message`
- `test_batch_get_messages`
- `test_delete_context_removes_all`
- `test_concurrent_write`

---

#### Task 1.5.7: 创建 spec delta ⏳

**文件**: `openspec/changes/refactor-context-session-architecture/specs/sync/spec.md`

```markdown
## ADDED Requirements

### Requirement: Signal-Pull Synchronization

The system SHALL implement a signal-pull synchronization model for frontend-backend state updates.

#### Scenario: Frontend receives content delta signal

- **GIVEN** a message is being streamed
- **WHEN** a new chunk arrives at the backend
- **THEN** the backend SHALL send a `ContentDelta` SSE event with message_id and sequence number
- **AND** the event SHALL NOT contain the text content

#### Scenario: Frontend pulls incremental content

- **GIVEN** the frontend receives a `ContentDelta` signal with sequence N
- **AND** the local sequence is M < N
- **WHEN** the frontend calls GET /messages/{id}/content?from_sequence=M
- **THEN** the backend SHALL return all chunks with sequence > M
- **AND** the chunks SHALL be in ascending sequence order

#### Scenario: Auto-healing from missed signals

- **GIVEN** the frontend missed signals for sequence 2 and 3
- **AND** the local sequence is 1
- **WHEN** the frontend receives signal for sequence 4
- **THEN** the frontend SHALL pull content from sequence 1
- **AND** the backend SHALL return chunks [2, 3, 4]
- **AND** the frontend state SHALL be fully synchronized

### Requirement: Context-Local Message Pool

The system SHALL store all messages for a context within the context's own directory.

#### Scenario: Context deletion

- **GIVEN** a context with 100 messages across 3 branches
- **WHEN** the context is deleted
- **THEN** the system SHALL remove the entire context directory
- **AND** no garbage collection SHALL be required
- **AND** no orphaned message files SHALL remain

#### Scenario: Branch creation

- **GIVEN** a context with a main branch containing messages [A, B, C]
- **WHEN** a new branch is created from main
- **THEN** the new branch SHALL reference the same message IDs
- **AND** no message files SHALL be copied or duplicated
- **AND** the operation SHALL complete in < 10ms
```

---

#### Task 1.5.8: 更新 tasks.md ⏳

在 Phase 1 和 Phase 2 之间插入 Phase 1.5。

---

## 📊 工作量估算

| 任务 | 文件数 | 预计代码行数 | 测试用例 | 预计时间 |
|------|--------|-------------|---------|---------|
| MessageMetadata 扩展 | 1 | ~150 | 5 | 2 小时 |
| StreamingResponse 类型 | 1 | ~200 | 6 | 3 小时 |
| Context 集成 | 1 | ~150 | 4 | 2 小时 |
| REST API 端点 | 2 | ~300 | 8 | 4 小时 |
| SSE 信令推送 | 1 | ~150 | 3 | 3 小时 |
| 存储层实现 | 1 | ~250 | 5 | 3 小时 |
| Spec delta 和文档 | 2 | ~200 (markdown) | - | 2 小时 |
| 集成测试 | 1 | ~200 | 3 | 2 小时 |
| **总计** | **10** | **~1,600** | **34** | **~21 小时** |

**预计完成时间**: 2-3 天（包含测试和文档）

---

## ⚠️ 风险和缓解措施

### 风险 1: SSE 连接稳定性

**问题**: SSE 长连接可能被代理、防火墙中断

**缓解**:
- 实现心跳机制（每 30 秒发送 ping）
- 前端自动重连（指数退避）
- 状态自动恢复（通过序列号）

### 风险 2: 存储层性能

**问题**: 大量小文件可能影响性能

**缓解**:
- 现代文件系统（ext4, APFS）处理小文件很高效
- 消息按 Context 隔离，避免单目录文件过多
- 未来可优化为批量写入或 SQLite（保持接口不变）

### 风险 3: 序列号不一致

**问题**: 并发情况下序列号可能错乱

**缓解**:
- 使用原子操作（AtomicU64）管理序列号
- 在 StreamingResponse 内部维护序列
- 单线程流式写入（避免竞态）

---

## 🎯 验收标准

### 功能验收
- [ ] Context 可以独立备份/恢复（单文件夹操作）
- [ ] 分支创建/合并不涉及文件 I/O
- [ ] SSE 信令 payload < 1KB
- [ ] 前端可以从任意序列号拉取内容
- [ ] 信令丢失时前端自动修复状态

### 性能验收
- [ ] 分支创建 < 10ms
- [ ] 删除 Context < 100ms（100 条消息）
- [ ] SSE 信令延迟 < 50ms
- [ ] 增量内容拉取 < 100ms

### 测试验收
- [ ] 单元测试覆盖率 > 90%
- [ ] 集成测试覆盖主要场景
- [ ] 负载测试（模拟 10 个并发流式响应）
- [ ] 网络异常测试（模拟信令丢失）

---

## 📝 下一步行动

1. **立即开始**: Task 1.5.1 - 扩展 MessageMetadata
2. **并行开发**: 可以同时进行 StreamingResponse 和 Storage 层开发
3. **集成测试**: 完成核心功能后立即进行端到端测试
4. **文档完善**: 边开发边更新 API 文档和使用示例

---

**状态**: 准备就绪，等待实施指令 🚀

