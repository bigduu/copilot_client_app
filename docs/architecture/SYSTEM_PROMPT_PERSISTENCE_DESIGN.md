# System Prompt Persistence Design

## 目标

为每个 context 保存最后使用的增强 system prompt 到 `system_prompt.json`，方便调试和追踪。

## 动机

1. **可追踪性** - 开发者可以看到 AI 实际接收到的完整 system prompt
2. **调试友好** - 快速定位 prompt 相关问题
3. **版本对比** - 可以比较不同版本的 prompt 变化
4. **透明度** - 了解工具定义、角色权限等如何注入到 prompt 中

## 设计方案

### 文件结构

```
data/contexts/{context_id}/
├── context.json           # 现有：上下文元数据和配置
├── system_prompt.json     # 新增：最后使用的 system prompt 快照
└── messages/              # 现有：消息池
    ├── {message_id}.json
    └── ...
```

### 数据结构

```rust
/// System Prompt Snapshot - 保存到 system_prompt.json
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SystemPromptSnapshot {
    /// 快照版本（每次更新递增）
    pub version: u64,
    
    /// 生成时间
    pub generated_at: DateTime<Utc>,
    
    /// Context ID
    pub context_id: Uuid,
    
    /// 当前代理角色
    pub agent_role: AgentRole,
    
    /// 基础 prompt 来源
    pub base_prompt_source: PromptSource,
    
    /// 最终增强后的 system prompt（发送给 LLM 的完整内容）
    pub enhanced_prompt: String,
    
    /// Prompt 片段详情（可选，用于调试）
    pub fragments: Option<Vec<PromptFragmentInfo>>,
    
    /// 可用工具列表（工具名称）
    pub available_tools: Vec<String>,
    
    /// 统计信息
    pub stats: PromptStats,
}

/// Prompt 来源
#[derive(Serialize, Deserialize, Clone, Debug)]
pub enum PromptSource {
    /// 从 SystemPromptService 加载
    Service { prompt_id: String },
    /// 分支自定义 prompt
    Branch { branch_name: String },
    /// 默认 prompt
    Default,
}

/// Prompt 片段信息（调试用）
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptFragmentInfo {
    pub source: String,      // 例如 "tool_enhancement", "role_context"
    pub priority: u8,
    pub length: usize,
    pub preview: String,     // 前 100 个字符预览
}

/// 统计信息
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PromptStats {
    pub total_length: usize,
    pub fragment_count: usize,
    pub tool_count: usize,
    pub enhancement_time_ms: u64,
}
```

### 实现步骤

#### 步骤 1: 创建数据结构 (context_manager)

**文件**: `crates/context_manager/src/structs/system_prompt_snapshot.rs`

```rust
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::structs::context_agent::AgentRole;

// ... 上面定义的结构体
```

**文件**: `crates/context_manager/src/structs/mod.rs`

```rust
pub mod system_prompt_snapshot;
pub use system_prompt_snapshot::*;
```

#### 步骤 2: 扩展存储接口

**文件**: `crates/web_service/src/storage/provider.rs`

```rust
#[async_trait]
pub trait StorageProvider: Send + Sync {
    // ... 现有方法
    
    /// 保存 system prompt 快照
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), String>;
    
    /// 加载最新的 system prompt 快照
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>, String>;
}
```

#### 步骤 3: 实现存储逻辑

**文件**: `crates/web_service/src/storage/message_pool_provider.rs`

```rust
impl StorageProvider for MessagePoolStorageProvider {
    // ... 现有方法
    
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<(), String> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");
        
        let json = serde_json::to_string_pretty(snapshot)
            .map_err(|e| format!("Failed to serialize snapshot: {}", e))?;
        
        tokio::fs::write(&snapshot_path, json)
            .await
            .map_err(|e| format!("Failed to write snapshot: {}", e))?;
        
        debug!(
            context_id = %context_id,
            version = snapshot.version,
            "Saved system prompt snapshot"
        );
        
        Ok(())
    }
    
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>, String> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");
        
        if !snapshot_path.exists() {
            return Ok(None);
        }
        
        let json = tokio::fs::read_to_string(&snapshot_path)
            .await
            .map_err(|e| format!("Failed to read snapshot: {}", e))?;
        
        let snapshot: SystemPromptSnapshot = serde_json::from_str(&json)
            .map_err(|e| format!("Failed to deserialize snapshot: {}", e))?;
        
        Ok(Some(snapshot))
    }
}
```

#### 步骤 4: 在 LlmRequestBuilder 中生成和保存快照

**文件**: `crates/web_service/src/services/llm_request_builder.rs`

```rust
use context_manager::{SystemPromptSnapshot, PromptSource, PromptStats};
use chrono::Utc;

impl LlmRequestBuilder {
    pub async fn build(
        &self,
        context: &Arc<RwLock<ChatContext>>,
        storage: &Arc<dyn StorageProvider>, // 新增参数
    ) -> Result<BuiltLlmRequest, AppError> {
        // ... 现有代码
        
        // 生成 system prompt 快照
        if let Some(ref enhanced) = prepared.enhanced_system_prompt {
            let snapshot = self.create_prompt_snapshot(
                &context.read().await,
                &prepared,
                enhanced,
            ).await;
            
            // 保存快照
            if let Err(e) = storage
                .save_system_prompt_snapshot(prepared.context_id, &snapshot)
                .await
            {
                log::warn!(
                    "Failed to save system prompt snapshot: {}",
                    e
                );
                // 不阻塞主流程
            }
        }
        
        // ... 现有代码
    }
    
    async fn create_prompt_snapshot(
        &self,
        context: &ChatContext,
        prepared: &PreparedLlmRequest,
        enhanced_prompt: &str,
    ) -> SystemPromptSnapshot {
        // 获取或递增版本号
        let version = self.get_next_version(context.id).await;
        
        // 确定 prompt 来源
        let base_prompt_source = if prepared.branch_system_prompt.is_some() {
            PromptSource::Branch {
                branch_name: prepared.branch_name.clone(),
            }
        } else if let Some(ref id) = prepared.system_prompt_id {
            PromptSource::Service {
                prompt_id: id.clone(),
            }
        } else {
            PromptSource::Default
        };
        
        // 收集工具列表
        let available_tools: Vec<String> = prepared
            .available_tools
            .iter()
            .map(|t| t.name.clone())
            .collect();
        
        SystemPromptSnapshot {
            version,
            generated_at: Utc::now(),
            context_id: context.id,
            agent_role: context.config.agent_role.clone(),
            base_prompt_source,
            enhanced_prompt: enhanced_prompt.to_string(),
            fragments: None, // 可以后续添加详细片段信息
            available_tools,
            stats: PromptStats {
                total_length: enhanced_prompt.len(),
                fragment_count: 0, // 需要从 Pipeline 获取
                tool_count: prepared.available_tools.len(),
                enhancement_time_ms: 0, // 可以添加计时
            },
        }
    }
    
    // 版本号管理（可以使用内存缓存或从文件读取）
    async fn get_next_version(&self, context_id: Uuid) -> u64 {
        // 简单实现：从现有快照读取版本号 + 1
        // 或使用 AtomicU64 在内存中维护
        1 // 临时返回
    }
}
```

#### 步骤 5: 更新 ChatService 调用

**文件**: `crates/web_service/src/services/chat_service.rs`

```rust
impl<T: StorageProvider + 'static> ChatService<T> {
    async fn send_to_llm(&mut self, context: &Arc<RwLock<ChatContext>>) -> Result<...> {
        // 构建请求时传入 storage
        let built_request = self.llm_request_builder
            .build(context, &self.session_manager.storage)
            .await?;
        
        // ... 其余代码
    }
}
```

### 快照示例

```json
{
  "version": 42,
  "generated_at": "2025-11-19T01:15:30.123Z",
  "context_id": "091a3d54-f001-4d1e-b0f8-2d152c5ba7d5",
  "agent_role": "actor",
  "base_prompt_source": {
    "Service": {
      "prompt_id": "default"
    }
  },
  "enhanced_prompt": "You are a helpful AI assistant...\n\n## Available Tools\n\nYou have access to the following tools:\n\n### File System Tools\n\n#### `list_directory`\n\nList files and directories...",
  "available_tools": [
    "read_file",
    "create_file",
    "update_file",
    "list_directory",
    "grep",
    "glob",
    "search",
    "append_file",
    "delete_file",
    "replace_in_file",
    "edit_lines"
  ],
  "stats": {
    "total_length": 4523,
    "fragment_count": 5,
    "tool_count": 11,
    "enhancement_time_ms": 12
  }
}
```

## 配置选项

可以添加配置控制是否保存快照：

```rust
pub struct DebugConfig {
    /// 是否保存 system prompt 快照
    pub save_system_prompt_snapshots: bool,
    
    /// 是否包含详细的片段信息
    pub include_fragment_details: bool,
    
    /// 保留的历史版本数量（0 = 只保留最新）
    pub max_snapshot_versions: usize,
}
```

## 优化方向

### 1. 历史版本管理

```
data/contexts/{context_id}/
├── context.json
├── system_prompt.json              # 最新版本
└── system_prompts/                 # 历史版本（可选）
    ├── version_001.json
    ├── version_002.json
    └── version_042.json
```

### 2. 差异对比

保存时计算与上一版本的 diff：

```rust
pub struct PromptDiff {
    pub previous_version: u64,
    pub changes: Vec<Change>,
}

pub enum Change {
    ToolAdded(String),
    ToolRemoved(String),
    RoleChanged { from: AgentRole, to: AgentRole },
    ContentModified { section: String, diff: String },
}
```

### 3. 性能优化

- 使用异步 I/O 避免阻塞主流程
- 仅在 prompt 实际变化时保存
- 使用 LRU 缓存避免重复读取

## API 端点（可选）

为前端提供查询接口：

```rust
// GET /api/contexts/{context_id}/system-prompt
async fn get_system_prompt_snapshot(
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    // 返回最新的 system_prompt.json
}

// GET /api/contexts/{context_id}/system-prompt/versions
async fn list_prompt_versions(
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    // 返回所有历史版本
}
```

## 测试计划

1. **单元测试**
   - 测试快照序列化/反序列化
   - 测试版本号递增
   - 测试文件读写

2. **集成测试**
   - 创建 context → 发送消息 → 验证 system_prompt.json 存在
   - 修改角色 → 发送消息 → 验证版本号递增
   - 添加工具 → 验证工具列表更新

3. **手动验证**
   - 检查生成的 JSON 格式
   - 对比实际发送给 LLM 的内容
   - 验证不同角色的 prompt 差异

## 实施优先级

**Phase 1 (MVP)**:
- ✅ 基础数据结构
- ✅ 保存最新 system_prompt.json
- ✅ 包含完整的增强 prompt
- ✅ 基础统计信息

**Phase 2 (增强)**:
- ⏳ 添加片段详情
- ⏳ 版本历史管理
- ⏳ API 查询接口

**Phase 3 (优化)**:
- ⏳ 差异对比
- ⏳ 性能优化
- ⏳ 前端可视化

## 时间估算

- **Phase 1**: 2-3 小时
  - 数据结构定义: 30 分钟
  - 存储实现: 1 小时
  - LlmRequestBuilder 集成: 1 小时
  - 测试: 30 分钟

- **Phase 2**: 3-4 小时
- **Phase 3**: 4-6 小时

## 风险和注意事项

1. **磁盘空间** - 每次消息都保存可能占用较多空间
   - 缓解：定期清理旧版本
   
2. **并发写入** - 多个请求同时更新可能冲突
   - 缓解：使用版本号乐观锁
   
3. **敏感信息** - Prompt 可能包含用户数据
   - 缓解：在生产环境可禁用此功能

## 下一步行动

1. 审查此设计文档
2. 确认是否需要调整
3. 开始实施 Phase 1
4. 测试验证
5. 根据反馈迭代
