# System Prompt Persistence - Implementation Status

## 已完成的工作 ✅

### 1. 数据结构定义 (100%)

**文件**: `crates/context_manager/src/structs/system_prompt_snapshot.rs`

- ✅ `SystemPromptSnapshot` - 主快照结构
- ✅ `PromptSource` - 提示来源枚举
- ✅ `PromptFragmentInfo` - 片段信息（可选）
- ✅ `PromptStats` - 统计信息
- ✅ 辅助方法和单元测试

**特点**:
- 包含版本号、时间戳、上下文ID
- 记录代理角色和工具列表
- 支持序列化/反序列化
- 包含完整的增强 system prompt

### 2. 存储接口扩展 (100%)

**文件**: `crates/web_service/src/storage/provider.rs`

- ✅ `save_system_prompt_snapshot()` - 保存快照
- ✅ `load_system_prompt_snapshot()` - 加载快照

**改动**:
```rust
/// Save system prompt snapshot for debugging and tracing
async fn save_system_prompt_snapshot(
    &self,
    context_id: Uuid,
    snapshot: &SystemPromptSnapshot,
) -> Result<()>;

/// Load the latest system prompt snapshot
async fn load_system_prompt_snapshot(
    &self,
    context_id: Uuid,
) -> Result<Option<SystemPromptSnapshot>>;
```

## 待完成的工作 ⏳

### 3. MessagePoolStorageProvider 实现 (0%)

**文件**: `crates/web_service/src/storage/message_pool_provider.rs`

**需要添加**:

```rust
#[async_trait]
impl StorageProvider for MessagePoolStorageProvider {
    // ... 现有方法 ...
    
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");
        
        // 序列化并写入文件
        let json = serde_json::to_string_pretty(snapshot)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;
        
        tokio::fs::write(&snapshot_path, json)
            .await
            .map_err(|e| AppError::IoError(e.to_string()))?;
        
        tracing::debug!(
            context_id = %context_id,
            version = snapshot.version,
            "Saved system prompt snapshot"
        );
        
        Ok(())
    }
    
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        let context_dir = self.get_context_dir(context_id);
        let snapshot_path = context_dir.join("system_prompt.json");
        
        if !snapshot_path.exists() {
            return Ok(None);
        }
        
        let json = tokio::fs::read_to_string(&snapshot_path)
            .await
            .map_err(|e| AppError::IoError(e.to_string()))?;
        
        let snapshot: SystemPromptSnapshot = serde_json::from_str(&json)
            .map_err(|e| AppError::SerializationError(e.to_string()))?;
        
        Ok(Some(snapshot))
    }
}
```

**预计时间**: 30 分钟

### 4. MemoryStorageProvider 实现 (0%)

**文件**: `crates/web_service/src/storage/memory_provider.rs`

**需要添加**:

```rust
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct MemoryStorageProvider {
    contexts: Arc<RwLock<HashMap<Uuid, ChatContext>>>,
    snapshots: Arc<RwLock<HashMap<Uuid, SystemPromptSnapshot>>>, // 新增
}

impl MemoryStorageProvider {
    pub fn new() -> Self {
        Self {
            contexts: Arc::new(RwLock::new(HashMap::new())),
            snapshots: Arc::new(RwLock::new(HashMap::new())), // 新增
        }
    }
}

#[async_trait]
impl StorageProvider for MemoryStorageProvider {
    // ... 现有方法 ...
    
    async fn save_system_prompt_snapshot(
        &self,
        context_id: Uuid,
        snapshot: &SystemPromptSnapshot,
    ) -> Result<()> {
        let mut snapshots = self.snapshots.write().await;
        snapshots.insert(context_id, snapshot.clone());
        Ok(())
    }
    
    async fn load_system_prompt_snapshot(
        &self,
        context_id: Uuid,
    ) -> Result<Option<SystemPromptSnapshot>> {
        let snapshots = self.snapshots.read().await;
        Ok(snapshots.get(&context_id).cloned())
    }
}
```

**预计时间**: 15 分钟

### 5. LlmRequestBuilder 集成 (0%)

**文件**: `crates/web_service/src/services/llm_request_builder.rs`

**需要修改**:

1. 添加导入:
```rust
use context_manager::structs::system_prompt_snapshot::{
    SystemPromptSnapshot, PromptSource, PromptStats
};
use chrono::Utc;
```

2. 修改 `build()` 方法签名和实现:
```rust
pub async fn build(
    &self,
    context: &Arc<RwLock<ChatContext>>,
    storage: &Arc<dyn StorageProvider>, // 新增参数
) -> Result<BuiltLlmRequest, AppError> {
    let prepared = {
        let mut context_lock = context.write().await;
        context_lock.prepare_llm_request_async().await
    };
    
    // ... 现有的 system prompt 处理逻辑 ...
    
    // 生成并保存快照
    if let Some(ref enhanced) = prepared.enhanced_system_prompt {
        let snapshot = self.create_snapshot(
            &context.read().await,
            &prepared,
            enhanced,
        ).await;
        
        // 异步保存，不阻塞主流程
        let storage_clone = storage.clone();
        let snapshot_clone = snapshot.clone();
        tokio::spawn(async move {
            if let Err(e) = storage_clone
                .save_system_prompt_snapshot(snapshot_clone.context_id, &snapshot_clone)
                .await
            {
                log::warn!("Failed to save system prompt snapshot: {:?}", e);
            }
        });
    }
    
    // ... 其余代码 ...
}
```

3. 添加辅助方法:
```rust
impl LlmRequestBuilder {
    async fn create_snapshot(
        &self,
        context: &ChatContext,
        prepared: &PreparedLlmRequest,
        enhanced_prompt: &str,
    ) -> SystemPromptSnapshot {
        // 获取版本号（暂时使用简单递增）
        let version = 1; // TODO: 实现版本管理
        
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
        
        SystemPromptSnapshot::new(
            version,
            context.id,
            context.config.agent_role.clone(),
            base_prompt_source,
            enhanced_prompt.to_string(),
            available_tools,
        )
    }
}
```

**预计时间**: 45 分钟

### 6. 更新 ChatService 调用 (0%)

**文件**: `crates/web_service/src/services/chat_service.rs`

**需要修改**:

```rust
impl<T: StorageProvider + 'static> ChatService<T> {
    async fn send_to_llm(
        &mut self,
        context: &Arc<RwLock<ChatContext>>,
    ) -> Result<...> {
        // 获取 storage 引用
        let storage = self.session_manager.storage.clone();
        
        // 构建请求时传入 storage
        let built_request = self.llm_request_builder
            .build(context, &storage) // 添加 storage 参数
            .await?;
        
        // ... 其余代码 ...
    }
}
```

**注意**: 需要在 `ChatSessionManager` 中暴露 `storage` 字段。

**预计时间**: 15 分钟

### 7. 添加 SessionManager 的 storage 访问器 (0%)

**文件**: `crates/web_service/src/services/session_manager.rs`

**需要添加**:

```rust
impl<T: StorageProvider> ChatSessionManager<T> {
    // ... 现有方法 ...
    
    /// Get a reference to the storage provider
    pub fn storage(&self) -> &Arc<T> {
        &self.storage
    }
}
```

**预计时间**: 5 分钟

## 测试计划

### 单元测试

1. **SystemPromptSnapshot 测试** ✅
   - 已在 `system_prompt_snapshot.rs` 中实现
   - 测试序列化/反序列化
   - 测试创建和预览

2. **存储测试** ⏳
   - 测试保存和加载快照
   - 测试不存在的快照返回 None
   - 测试序列化错误处理

### 集成测试

1. **端到端测试** ⏳
   - 创建 context
   - 发送消息
   - 验证 `system_prompt.json` 文件创建
   - 验证内容正确性

2. **版本测试** ⏳
   - 多次发送消息
   - 验证版本号递增

## 剩余工作总时间估算

- MessagePoolStorageProvider 实现: 30分钟
- MemoryStorageProvider 实现: 15分钟
- LlmRequestBuilder 集成: 45分钟
- ChatService 更新: 15分钟
- SessionManager 访问器: 5分钟
- 测试: 30分钟

**总计**: 约 2.5 小时

## 下一步建议

### 选项 1: 继续实施
按照上面的顺序完成剩余步骤 3-7。

### 选项 2: 最小验证
只实现 MessagePoolStorageProvider 和 LlmRequestBuilder 集成，快速验证功能。

### 选项 3: 分阶段进行
1. 先完成存储实现（步骤 3-4）
2. 测试存储功能
3. 再集成到 LlmRequestBuilder（步骤 5-7）

## 已创建的文件

1. ✅ `/crates/context_manager/src/structs/system_prompt_snapshot.rs` - 数据结构
2. ✅ `/docs/architecture/SYSTEM_PROMPT_PERSISTENCE_DESIGN.md` - 设计文档
3. ✅ `/docs/architecture/SYSTEM_PROMPT_IMPLEMENTATION_STATUS.md` - 本文档

## 依赖关系

```
SystemPromptSnapshot (完成)
    ↓
StorageProvider trait (完成)
    ↓
MessagePoolStorageProvider impl (待完成)
    ↓
LlmRequestBuilder integration (待完成)
    ↓
ChatService update (待完成)
    ↓
测试验证 (待完成)
```

## 验证清单

完成后需要验证：

- [ ] `data/contexts/{context_id}/system_prompt.json` 文件创建
- [ ] JSON 格式正确且可读
- [ ] `enhanced_prompt` 字段包含完整内容
- [ ] `available_tools` 列表正确
- [ ] 版本号正确递增
- [ ] 时间戳准确
- [ ] 代理角色正确记录
- [ ] 不影响现有功能（保存失败不阻塞）

## 使用示例

完成后，你可以：

```bash
# 发送一条消息后
cat data/contexts/091a3d54-f001-4d1e-b0f8-2d152c5ba7d5/system_prompt.json

# 查看完整的 system prompt
jq '.enhanced_prompt' system_prompt.json

# 查看工具列表
jq '.available_tools' system_prompt.json

# 查看统计信息
jq '.stats' system_prompt.json
```
