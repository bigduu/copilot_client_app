# Context Lifecycle 重构计划

**文件**: `crates/web_service/src/controllers/context/context_lifecycle.rs` (517行)  
**日期**: 2024-11-25  
**目标**: 模块化拆分，提升可维护性

---

## 📊 当前结构分析

### **主要功能域**

#### 1. **Context 创建** (~100行)
- `create_context()` - 创建新 context
- 参数验证
- 初始化逻辑

#### 2. **Context 列表和查询** (~80行)
- `list_contexts()` - 获取 context 列表
- `get_context_metadata()` - 获取元数据
- 过滤和排序

#### 3. **Context 更新** (~100行)
- `update_context_config()` - 更新配置
- 配置验证
- 持久化

#### 4. **Context 删除** (~80行)
- `delete_context()` - 删除 context
- 清理逻辑
- 错误处理

#### 5. **辅助函数** (~100行)
- DTO 转换
- 验证逻辑
- 错误处理

---

## 🎯 重构方案

### **目标结构**

```
context_lifecycle/
├── mod.rs                    (~80行)  - 路由和公共接口
├── types.rs                  (~60行)  - 类型定义 (DTOs)
├── create.rs                 (~100行) - Context 创建
├── query.rs                  (~100行) - 列表和查询
├── update.rs                 (~100行) - 更新配置
├── delete.rs                 (~80行)  - 删除操作
└── helpers.rs                (~80行)  - 辅助函数

总计: ~600行 (7个文件，更清晰)
```

---

## 📋 详细拆分

### **mod.rs - 路由协调器**
```rust
//! Context lifecycle management - coordinator

pub mod create;
pub mod delete;
pub mod query;
pub mod update;
mod helpers;
mod types;

// Re-export public types
pub use types::*;

// Re-export handlers
pub use create::create_context;
pub use delete::delete_context;
pub use query::{get_context_metadata, list_contexts};
pub use update::update_context_config;

// Configure routes
pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/contexts")
            .route("", web::post().to(create::create_context))
            .route("", web::get().to(query::list_contexts))
            .route("/{id}", web::get().to(query::get_context_metadata))
            .route("/{id}/config", web::put().to(update::update_context_config))
            .route("/{id}", web::delete().to(delete::delete_context))
    );
}
```

### **types.rs - 类型定义**
```rust
//! Context lifecycle types and DTOs

use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Request types
#[derive(Debug, Deserialize)]
pub struct CreateContextRequest {
    pub initial_message: Option<String>,
    pub config: Option<ContextConfig>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateContextConfigRequest {
    pub agent_role: Option<String>,
    pub model_config: Option<ModelConfig>,
}

// Response types
#[derive(Debug, Serialize)]
pub struct CreateContextResponse {
    pub context_id: Uuid,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct ListContextsResponse {
    pub contexts: Vec<ContextSummary>,
    pub total: usize,
}

// DTO types
#[derive(Debug, Serialize)]
pub struct ContextSummary {
    pub id: Uuid,
    pub title: Option<String>,
    pub message_count: usize,
    pub created_at: String,
    pub updated_at: String,
}
```

### **create.rs - Context 创建**
```rust
//! Context creation logic

use super::types::*;
use crate::server::AppState;
use actix_web::{web, HttpResponse};

/// Create a new chat context
pub async fn create_context(
    app_state: web::Data<AppState>,
    payload: web::Json<CreateContextRequest>,
) -> Result<HttpResponse, Error> {
    // Validation
    validate_create_request(&payload)?;
    
    // Create context
    let context_id = create_new_context(&app_state, &payload).await?;
    
    // Initialize if needed
    if let Some(msg) = &payload.initial_message {
        initialize_context(&app_state, context_id, msg).await?;
    }
    
    Ok(HttpResponse::Ok().json(CreateContextResponse {
        context_id,
        created_at: chrono::Utc::now().to_rfc3339(),
    }))
}

async fn create_new_context(...) -> Result<Uuid> {
    // Implementation
}

async fn initialize_context(...) -> Result<()> {
    // Implementation
}

fn validate_create_request(...) -> Result<()> {
    // Implementation
}
```

### **query.rs - 查询操作**
```rust
//! Context query operations

use super::types::*;
use crate::server::AppState;
use actix_web::{web, HttpResponse};

/// List all contexts for a session
pub async fn list_contexts(
    app_state: web::Data<AppState>,
    session_id: web::Path<Uuid>,
) -> Result<HttpResponse, Error> {
    let contexts = fetch_contexts(&app_state, *session_id).await?;
    let summaries = convert_to_summaries(contexts);
    
    Ok(HttpResponse::Ok().json(ListContextsResponse {
        contexts: summaries,
        total: summaries.len(),
    }))
}

/// Get context metadata
pub async fn get_context_metadata(
    app_state: web::Data<AppState>,
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, Error> {
    let metadata = fetch_metadata(&app_state, *context_id).await?;
    Ok(HttpResponse::Ok().json(metadata))
}

async fn fetch_contexts(...) -> Result<Vec<Context>> {
    // Implementation
}

fn convert_to_summaries(...) -> Vec<ContextSummary> {
    // Implementation
}
```

### **update.rs - 更新操作**
```rust
//! Context update operations

use super::types::*;
use crate::server::AppState;
use actix_web::{web, HttpResponse};

/// Update context configuration
pub async fn update_context_config(
    app_state: web::Data<AppState>,
    context_id: web::Path<Uuid>,
    payload: web::Json<UpdateContextConfigRequest>,
) -> Result<HttpResponse, Error> {
    // Validate
    validate_update_request(&payload)?;
    
    // Update
    apply_config_update(&app_state, *context_id, &payload).await?;
    
    Ok(HttpResponse::Ok().json(json!({
        "status": "updated",
        "context_id": context_id
    })))
}

async fn apply_config_update(...) -> Result<()> {
    // Implementation
}

fn validate_update_request(...) -> Result<()> {
    // Implementation
}
```

### **delete.rs - 删除操作**
```rust
//! Context deletion operations

use super::types::*;
use crate::server::AppState;
use actix_web::{web, HttpResponse};

/// Delete a context
pub async fn delete_context(
    app_state: web::Data<AppState>,
    context_id: web::Path<Uuid>,
) -> Result<HttpResponse, Error> {
    // Check if exists
    ensure_context_exists(&app_state, *context_id).await?;
    
    // Delete
    perform_deletion(&app_state, *context_id).await?;
    
    Ok(HttpResponse::Ok().json(json!({
        "status": "deleted",
        "context_id": context_id
    })))
}

async fn perform_deletion(...) -> Result<()> {
    // Implementation
}

async fn ensure_context_exists(...) -> Result<()> {
    // Implementation
}
```

### **helpers.rs - 辅助函数**
```rust
//! Helper functions for context lifecycle

use super::types::*;

/// Convert Context to ContextSummary
pub(super) fn to_summary(context: &Context) -> ContextSummary {
    ContextSummary {
        id: context.id,
        title: context.metadata.title.clone(),
        message_count: context.messages.len(),
        created_at: context.created_at.to_rfc3339(),
        updated_at: context.updated_at.to_rfc3339(),
    }
}

/// Validate context ID format
pub(super) fn validate_context_id(id: &Uuid) -> Result<()> {
    // Implementation
}

/// Common error handling
pub(super) fn handle_context_error(err: impl std::error::Error) -> Error {
    // Implementation
}
```

---

## 📝 重构步骤

### **Phase 1: 创建模块结构**
1. ✅ 创建 `context_lifecycle/` 文件夹
2. ✅ 创建所有模块文件（空框架）
3. ✅ 设置 `mod.rs` 基本结构

### **Phase 2: 提取类型定义**
4. ✅ 创建 `types.rs`
5. ✅ 迁移所有 DTO 和类型定义

### **Phase 3: 拆分功能模块**
6. ✅ 实现 `create.rs`
7. ✅ 实现 `query.rs`
8. ✅ 实现 `update.rs`
9. ✅ 实现 `delete.rs`

### **Phase 4: 辅助函数**
10. ✅ 实现 `helpers.rs`
11. ✅ 完成 `mod.rs` 路由配置

### **Phase 5: 更新引用**
12. ✅ 更新 `context/mod.rs`
13. ✅ 检查所有引用

### **Phase 6: 清理和验证**
14. ✅ 删除原文件
15. ✅ 编译测试
16. ✅ 修复错误

---

## 🎯 预期成果

**Before**:
- 1个文件，517行
- 所有功能混在一起

**After**:
- 7个模块，~600行
- 功能域清晰分离
- CRUD 操作独立
- 易于测试和维护

---

## ✅ 重构原则

1. **保持接口不变** - 外部调用者无需修改
2. **按操作类型分离** - Create/Read/Update/Delete
3. **单一职责** - 每个模块一个职责
4. **类型集中管理** - types.rs 统一定义
5. **辅助函数共享** - helpers.rs 复用

---

**开始重构！** 🚀
