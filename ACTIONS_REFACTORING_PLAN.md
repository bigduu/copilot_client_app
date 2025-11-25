# Actions 重构方案

**目标**: 模块化 FSM-driven action API  
**当前**: 421行，3个 endpoints  
**目标**: 5个文件，职责清晰

---

## 📊 当前状态

**文件**: `actions.rs` (421行)

**Endpoints**:
1. `PUT /contexts/{id}/role` - 更新 agent 角色
2. `POST /contexts/{id}/actions/approve_tools` - 批准工具执行
3. `POST /contexts/{id}/actions/send_message` - 发送消息（FSM流程）

**函数**: 4个 async 函数

---

## 🎯 重构目标

### **模块结构**

```
actions/
├── mod.rs                  (~60行)  - 协调器 + 重导出
├── types.rs                (~50行)  - Request/Response 类型
├── send_message.rs         (~120行) - 发送消息 action
├── approve_tools.rs        (~120行) - 批准工具 action
└── update_agent_role.rs    (~70行)  - 更新角色 action

总计: ~420行 (vs 原 421行)
```

---

## 📋 详细设计

### **types.rs - 类型定义**

```rust
//! Action API types and DTOs

use crate::{
    dto::ChatContextDTO,
    models::SendMessageRequestBody,
};
use serde::{Deserialize, Serialize};

// ============================================================================
// Request Types
// ============================================================================

#[derive(Deserialize, Debug, Clone)]
pub struct SendMessageActionRequest {
    #[serde(flatten)]
    pub body: SendMessageRequestBody,
}

#[derive(Deserialize, Debug)]
pub struct ApproveToolsActionRequest {
    pub tool_call_ids: Vec<String>,
}

#[derive(Deserialize, Debug)]
pub struct UpdateAgentRoleRequest {
    pub role: String, // "planner" or "actor"
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Serialize, Debug)]
pub struct ActionResponse {
    pub context: ChatContextDTO,
    pub status: String, // "idle", "awaiting_tool_approval", etc.
}
```

---

### **send_message.rs - 发送消息 Action**

```rust
//! Send message action - triggers full FSM flow

use super::types::{ActionResponse, SendMessageActionRequest};
use crate::{
    dto::ChatContextDTO,
    middleware::extract_trace_id,
    models::{MessagePayload, SendMessageRequest},
    server::AppState,
    services::chat_service::ChatService,
};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use uuid::Uuid;

/// Send a message and let the backend FSM handle all processing
#[post("/contexts/{id}/actions/send_message")]
pub async fn send_message_action(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<SendMessageActionRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);
    
    tracing::info!(
        context_id = %context_id,
        trace_id = ?trace_id,
        "Processing send_message action"
    );

    // Load context
    let context = match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(ctx)) => ctx,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(err) => {
            error!("Failed to load context {}: {}", context_id, err);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })));
        }
    };

    // Build message request
    let message_request = SendMessageRequest {
        message: MessagePayload {
            role: req.body.role.clone(),
            content: req.body.content.clone(),
        },
        model_id: req.body.model_id.clone(),
        stream: req.body.stream,
    };

    // Process via FSM
    let chat_service = ChatService::new(
        app_state.copilot_client.clone(),
        app_state.session_manager.clone(),
        app_state.tool_executor.clone(),
    );

    match chat_service
        .process_user_message(&context, message_request, trace_id)
        .await
    {
        Ok(_) => {
            let response_dto = {
                let ctx = context.read().await;
                ChatContextDTO::from(ctx.clone())
            };

            let status = format!("{:?}", response_dto.current_state);
            info!(
                "send_message action completed for context {}: status={}",
                context_id, status
            );

            Ok(HttpResponse::Ok().json(ActionResponse {
                context: response_dto,
                status,
            }))
        }
        Err(err) => {
            error!("Failed to process message for context {}: {}", context_id, err);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to process message: {}", err)
            })))
        }
    }
}
```

---

### **approve_tools.rs - 批准工具 Action**

```rust
//! Approve tools action - continues FSM after approval

use super::types::{ActionResponse, ApproveToolsActionRequest};
use crate::{
    dto::ChatContextDTO,
    middleware::extract_trace_id,
    server::AppState,
    services::chat_service::ChatService,
};
use actix_web::{
    post,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use log::{error, info};
use tracing;
use uuid::Uuid;

/// Approve tools and continue FSM processing
#[post("/contexts/{id}/actions/approve_tools")]
pub async fn approve_tools_action(
    app_state: Data<AppState>,
    path: Path<Uuid>,
    req: Json<ApproveToolsActionRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    tracing::info!(
        context_id = %context_id,
        trace_id = ?trace_id,
        tool_count = req.tool_call_ids.len(),
        "Processing approve_tools action"
    );

    // Load context
    let context = match app_state
        .session_manager
        .load_context(context_id, trace_id.clone())
        .await
    {
        Ok(Some(ctx)) => ctx,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(err) => {
            error!("Failed to load context {}: {}", context_id, err);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })));
        }
    };

    // Approve tools
    {
        let mut ctx = context.write().await;
        for tool_call_id in &req.tool_call_ids {
            ctx.approve_tool_call(tool_call_id);
        }
    }

    // Continue FSM processing
    let chat_service = ChatService::new(
        app_state.copilot_client.clone(),
        app_state.session_manager.clone(),
        app_state.tool_executor.clone(),
    );

    match chat_service
        .continue_after_tool_approval(&context, trace_id)
        .await
    {
        Ok(_) => {
            let response_dto = {
                let ctx = context.read().await;
                ChatContextDTO::from(ctx.clone())
            };

            let status = format!("{:?}", response_dto.current_state);
            info!(
                "approve_tools action completed for context {}: status={}",
                context_id, status
            );

            Ok(HttpResponse::Ok().json(ActionResponse {
                context: response_dto,
                status,
            }))
        }
        Err(err) => {
            error!(
                "Failed to continue after tool approval for context {}: {}",
                context_id, err
            );
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("Failed to continue processing: {}", err)
            })))
        }
    }
}
```

---

### **update_agent_role.rs - 更新角色**

```rust
//! Update agent role action

use super::types::UpdateAgentRoleRequest;
use crate::{middleware::extract_trace_id, server::AppState};
use actix_web::{
    put,
    web::{Data, Json, Path},
    HttpRequest, HttpResponse, Result,
};
use context_manager::AgentRole;
use log::{error, info};
use tracing;

/// Update the agent role for a context
#[put("/contexts/{id}/role")]
pub async fn update_agent_role(
    app_state: Data<AppState>,
    path: Path<String>,
    req: Json<UpdateAgentRoleRequest>,
    http_req: HttpRequest,
) -> Result<HttpResponse> {
    let context_id = path.into_inner();
    let trace_id = extract_trace_id(&http_req);

    let context_uuid = match uuid::Uuid::parse_str(&context_id) {
        Ok(id) => id,
        Err(_) => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid context ID format"
            })))
        }
    };

    tracing::info!(
        context_id = %context_id,
        trace_id = ?trace_id,
        role = %req.role,
        "Updating agent role"
    );

    // Parse role
    let agent_role = match req.role.to_lowercase().as_str() {
        "planner" => AgentRole::Planner,
        "actor" => AgentRole::Actor,
        _ => {
            return Ok(HttpResponse::BadRequest().json(serde_json::json!({
                "error": "Invalid role. Must be 'planner' or 'actor'"
            })))
        }
    };

    // Load context
    let context = match app_state
        .session_manager
        .load_context(context_uuid, trace_id.clone())
        .await
    {
        Ok(Some(ctx)) => ctx,
        Ok(None) => {
            return Ok(HttpResponse::NotFound().json(serde_json::json!({
                "error": "Context not found"
            })))
        }
        Err(err) => {
            error!("Failed to load context {}: {}", context_id, err);
            return Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to load context"
            })));
        }
    };

    // Update role
    {
        let mut ctx = context.write().await;
        ctx.set_agent_role(agent_role);
        ctx.mark_dirty();
    }

    info!("Updated agent role to {:?} for context {}", agent_role, context_id);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Agent role updated successfully",
        "role": req.role
    })))
}
```

---

### **mod.rs - 协调器**

```rust
//! Action-based API domain (FSM-driven)
//!
//! This module handles FSM-driven action-based API endpoints:
//! - Send message action (triggers full FSM flow)
//! - Approve tools action (continues FSM after approval)
//! - Update agent role
//!
//! These endpoints let the backend FSM handle all processing including:
//! - LLM responses
//! - Tool execution
//! - State management
//! - Auto-save

pub mod approve_tools;
pub mod send_message;
pub mod types;
pub mod update_agent_role;

// Re-export public types
pub use types::*;

// Re-export handlers
pub use approve_tools::approve_tools_action;
pub use send_message::send_message_action;
pub use update_agent_role::update_agent_role;
```

---

## ✅ API 保证

**Endpoints 保持不变**:
- `PUT /contexts/{id}/role`
- `POST /contexts/{id}/actions/approve_tools`
- `POST /contexts/{id}/actions/send_message`
- 请求/响应格式不变
- 前端无需任何修改

---

## 📝 重构步骤

1. ✅ 创建 `actions/` 文件夹
2. ✅ 创建 `types.rs`
3. ✅ 创建 `send_message.rs`
4. ✅ 创建 `approve_tools.rs`
5. ✅ 创建 `update_agent_role.rs`
6. ✅ 创建 `mod.rs`
7. ✅ 更新 `context/mod.rs`
8. ✅ 删除旧的 `actions.rs`
9. ✅ 验证编译

---

**开始重构！** 🚀
