# Signal-Pull Architecture Implementation Plan

**Date**: 2025-11-08
**Status**: Design Locked, Implementation Started
**Architecture**: Context-Local Message Pool + Signal-Pull Synchronization Model

---

## ✅ Completed Tasks

### 1. Design Document Updates ✅

Two key decisions have been added to `design.md`:

#### Decision 3.1: Context-Local Message Pool
- **Storage Structure**: `contexts/{ctx_id}/messages_pool/`
- **Key Features**:
  - Each Context is fully self-contained
  - Branch operations with zero file I/O
  - No garbage collection required
- **File Location**: design.md:1086-1181

#### Decision 4.5.1: Signal-Pull Synchronization Model
- **SSE Signaling**: Only push lightweight notifications (< 1KB)
- **REST Pull**: Frontend actively fetches data
- **Self-Healing**: Automatic recovery from lost signals via sequence numbers
- **File Location**: design.md:1296-1506

### 2. OpenSpec Validation ✅

```bash
$ openspec validate refactor-context-session-architecture --strict
✅ Change 'refactor-context-session-architecture' is valid
```

---

## 🚧 Pending Implementation Tasks

Based on the user-confirmed design, here is the detailed implementation plan:

### Phase 1.5: StreamingResponse & Signal-Pull Infrastructure

#### Task 1.5.1: Extend MessageMetadata ⏳

**Goal**: Add message source and streaming metadata fields

**File**: `crates/context_manager/src/structs/metadata.rs`

**New Structures**:

```rust
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MessageMetadata {
    // Existing fields
    pub created_at: Option<DateTime<Utc>>,
    pub duration_ms: Option<u64>,
    pub tokens: Option<TokenUsage>,

    // ✨ New fields
    /// Message source (user input vs AI generated vs tool result)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<MessageSource>,

    /// Frontend display hint
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_hint: Option<DisplayHint>,

    /// Streaming response metadata (if StreamingResponse)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub streaming: Option<StreamingMetadata>,

    /// Frontend original input (for echo)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_input: Option<String>,

    /// Trace ID (frontend-backend correlation)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,

    // Reserved extension field
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
    /// Summary text for frontend display
    pub summary: Option<String>,
    /// Whether to collapse display
    pub collapsed: bool,
    /// Icon hint
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

**Tests**:
- `test_message_source_serialization`
- `test_display_hint_defaults`
- `test_streaming_metadata_calculation`

---

#### Task 1.5.2: Implement StreamingResponse Message Type ⏳

**Goal**: Add dedicated streaming response message type

**File**: `crates/context_manager/src/structs/message_types.rs`

**New Content**:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RichMessageType {
    // ... existing types

    /// Streaming response message (complete record of LLM streaming generation)
    StreamingResponse(StreamingResponseMsg),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamingResponseMsg {
    /// Complete final content
    pub content: String,

    /// Streaming chunk sequence (in chronological order)
    pub chunks: Vec<StreamChunk>,

    /// Streaming start time
    pub started_at: DateTime<Utc>,

    /// Streaming completion time
    pub completed_at: DateTime<Utc>,

    /// Total duration (milliseconds)
    pub total_duration_ms: u64,

    /// LLM model name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Token usage
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TokenUsage>,

    /// Finish reason (stop, length, tool_calls, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct StreamChunk {
    /// Chunk sequence number (starting from 0)
    pub sequence: u64,

    /// Incremental content (delta)
    pub delta: String,

    /// Chunk receive time
    pub timestamp: DateTime<Utc>,

    /// Accumulated character count up to this chunk
    pub accumulated_chars: usize,

    /// Time interval from previous chunk (milliseconds)
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

**Tests**:
- `test_streaming_response_creation`
- `test_append_chunk_sequence`
- `test_finalize_calculates_duration`
- `test_chunk_interval_calculation`

---

#### Task 1.5.3: Context Integration with Streaming ⏳

**Goal**: Add streaming processing methods to ChatContext

**File**: `crates/context_manager/src/structs/context_lifecycle.rs`

**New Methods**:

```rust
impl ChatContext {
    /// Start streaming response (create message reference)
    pub fn begin_streaming_llm_response(&mut self, model: Option<String>) -> Result<Uuid> {
        // Create message ID
        let message_id = Uuid::new_v4();

        // Create StreamingResponse
        let streaming_msg = StreamingResponseMsg::new(model);
        let internal_msg = InternalMessage::from_rich(
            Role::Assistant,
            RichMessageType::StreamingResponse(streaming_msg)
        );

        // Add to message_pool
        let msg_node = MessageNode {
            id: message_id,
            message: internal_msg,
            parent_id: self.get_active_branch().message_ids.last().copied(),
        };

        self.message_pool.insert(message_id, msg_node);
        self.get_active_branch_mut().message_ids.push(message_id);

        // State transition
        self.current_state = ContextState::StreamingLLMResponse {
            chunks_received: 0,
            chars_accumulated: 0
        };

        self.mark_dirty();
        Ok(message_id)
    }

    /// Append streaming chunk
    pub fn append_streaming_chunk(&mut self, message_id: Uuid, delta: String) -> Result<u64> {
        let msg_node = self.message_pool.get_mut(&message_id)
            .ok_or_else(|| anyhow!("Message not found: {}", message_id))?;

        // Update StreamingResponse
        if let Some(RichMessageType::StreamingResponse(streaming)) = &mut msg_node.message.rich_type {
            streaming.append_chunk(delta);

            // Update state
            self.current_state = ContextState::StreamingLLMResponse {
                chunks_received: streaming.chunks.len(),
                chars_accumulated: streaming.content.len(),
            };

            self.mark_dirty();

            // Return current sequence number
            Ok(streaming.chunks.len() as u64)
        } else {
            Err(anyhow!("Message is not a StreamingResponse"))
        }
    }

    /// Complete streaming response
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

            // Update metadata
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

        // State transition
        self.current_state = ContextState::ProcessingLLMResponse;
        self.mark_dirty();

        Ok(())
    }
}
```

**Tests**:
- `test_begin_streaming_creates_message`
- `test_append_chunk_updates_state`
- `test_finalize_updates_metadata`
- `test_streaming_integration_flow`

---

#### Task 1.5.4: Implement REST API Endpoints ⏳

**Goal**: Implement REST API for Signal-Pull model

**Files**: `crates/web_service/src/routes/context_routes.rs`, `message_routes.rs`

**New Endpoints**:

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
    ids: String,  // Comma-separated UUIDs
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

    // If StreamingResponse, return incremental chunks
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
        // Non-streaming message, return complete content
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

**Tests**:
- `test_get_context_metadata`
- `test_batch_get_messages`
- `test_incremental_content_pull`
- `test_content_pull_with_sequence`

---

#### Task 1.5.5: Implement SSE Signaling Push ⏳

**Goal**: Implement lightweight SSE signaling channel

**File**: `crates/web_service/src/routes/sse_routes.rs`

**Implementation**:

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
                    // Only push signals belonging to this Context
                    let json = serde_json::to_string(&signal).ok()?;
                    let event = sse::Event::Data(sse::Data::new(json));
                    return Some((Ok(event), rx));
                }
                Ok(_) => continue,  // Ignore signals from other Contexts
                Err(broadcast::error::RecvError::Lagged(_)) => {
                    // Client is too slow, skip some signals (OK, will auto-heal)
                    continue;
                }
                Err(_) => return None,
            }
        }
    });

    Sse::from_stream(stream)
}

// Send signal in Context
impl ChatContext {
    pub fn send_signal(&self, signal: SSESignal, broadcast_tx: &broadcast::Sender<(Uuid, SSESignal)>) {
        let _ = broadcast_tx.send((self.id, signal));
    }
}
```

**Tests**:
- `test_sse_connection`
- `test_signal_filtering`
- `test_lagged_client_handling`

---

#### Task 1.5.6: Storage Layer Implementation ⏳

**Goal**: Implement Context-Local Message Pool storage

**File**: `crates/context_manager/src/storage/message_storage.rs`

**Implementation**:

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

    // Save message
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

    // Get message
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

    // Batch get
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

    // Save metadata
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

    // Delete Context (one step, no GC needed)
    pub async fn delete_context(&self, context_id: Uuid) -> Result<()> {
        let dir = self.context_dir(context_id);
        if dir.exists() {
            fs::remove_dir_all(dir).await?;
        }
        Ok(())
    }
}
```

**Tests**:
- `test_save_and_get_message`
- `test_batch_get_messages`
- `test_delete_context_removes_all`
- `test_concurrent_write`

---

#### Task 1.5.7: Create spec delta ⏳

**File**: `openspec/changes/refactor-context-session-architecture/specs/sync/spec.md`

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

#### Task 1.5.8: Update tasks.md ⏳

Insert Phase 1.5 between Phase 1 and Phase 2.

---

## 📊 Effort Estimation

| Task | File Count | Estimated LOC | Test Cases | Estimated Time |
|------|------------|---------------|------------|----------------|
| MessageMetadata Extension | 1 | ~150 | 5 | 2 hours |
| StreamingResponse Type | 1 | ~200 | 6 | 3 hours |
| Context Integration | 1 | ~150 | 4 | 2 hours |
| REST API Endpoints | 2 | ~300 | 8 | 4 hours |
| SSE Signaling Push | 1 | ~150 | 3 | 3 hours |
| Storage Layer Implementation | 1 | ~250 | 5 | 3 hours |
| Spec delta and Documentation | 2 | ~200 (markdown) | - | 2 hours |
| Integration Tests | 1 | ~200 | 3 | 2 hours |
| **Total** | **10** | **~1,600** | **34** | **~21 hours** |

**Estimated Completion Time**: 2-3 days (including testing and documentation)

---

## ⚠️ Risks and Mitigations

### Risk 1: SSE Connection Stability

**Issue**: SSE long connections may be interrupted by proxies or firewalls

**Mitigation**:
- Implement heartbeat mechanism (send ping every 30 seconds)
- Frontend automatic reconnection (exponential backoff)
- Automatic state recovery (via sequence numbers)

### Risk 2: Storage Layer Performance

**Issue**: Large number of small files may affect performance

**Mitigation**:
- Modern file systems (ext4, APFS) handle small files efficiently
- Messages are isolated by Context, avoiding too many files in a single directory
- Future optimization to batch writes or SQLite (keeping interface unchanged)

### Risk 3: Sequence Number Inconsistency

**Issue**: Sequence numbers may become inconsistent under concurrent conditions

**Mitigation**:
- Use atomic operations (AtomicU64) to manage sequence numbers
- Maintain sequence within StreamingResponse
- Single-threaded streaming writes (avoid race conditions)

---

## 🎯 Acceptance Criteria

### Functional Acceptance
- [ ] Context can be independently backed up/restored (single folder operation)
- [ ] Branch creation/merge involves no file I/O
- [ ] SSE signal payload < 1KB
- [ ] Frontend can pull content from any sequence number
- [ ] Frontend automatically repairs state when signals are lost

### Performance Acceptance
- [ ] Branch creation < 10ms
- [ ] Delete Context < 100ms (100 messages)
- [ ] SSE signal latency < 50ms
- [ ] Incremental content pull < 100ms

### Testing Acceptance
- [ ] Unit test coverage > 90%
- [ ] Integration tests cover main scenarios
- [ ] Load testing (simulate 10 concurrent streaming responses)
- [ ] Network anomaly testing (simulate signal loss)

---

## 📝 Next Actions

1. **Start Immediately**: Task 1.5.1 - Extend MessageMetadata
2. **Parallel Development**: StreamingResponse and Storage layer can be developed in parallel
3. **Integration Testing**: Conduct end-to-end testing immediately after core functionality is complete
4. **Documentation**: Update API documentation and usage examples during development

---

**Status**: Ready, awaiting implementation command 🚀

