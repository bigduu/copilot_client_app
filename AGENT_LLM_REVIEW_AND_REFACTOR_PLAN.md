# Agent-LLM Crate 重构计划

## 当前问题分析

### 1. 代码结构问题

```
agent-llm/src/
├── auth/                      # ❌ 应该属于 Copilot Provider
│   ├── cache.rs              # 仅 Copilot 使用
│   ├── handler.rs            # 仅 Copilot 使用
│   ├── token.rs              # 仅 Copilot 使用
│   ├── device_code.rs        # 仅 Copilot 使用
│   └── mod.rs
├── client/                    # ❌ 旧的 CopilotClient，应该删除或合并
│   ├── decorator.rs          # 可能保留为 Provider Decorator
│   ├── models_handler.rs     # 仅 Copilot 使用
│   ├── stream_tool_accumulator.rs
│   └── mod.rs
├── client_trait.rs           # ❌ 旧的 trait，应该删除
├── openai.rs                 # ❌ 应该是 provider 的一部分
├── models.rs                 # 需要清理
└── providers/
    ├── copilot/
    │   └── mod.rs            # ✅ 应该包含 auth 功能
    ├── openai/
    │   └── mod.rs            # ✅ 应该包含 openai.rs 的内容
```

### 2. 发现的具体问题

| 问题 | 影响 | 优先级 |
|------|------|--------|
| `auth/` 模块独立于 providers | Copilot 认证逻辑分散 | 高 |
| `client/` 是旧的 CopilotClient 实现 | 与新架构重复 | 高 |
| `client_trait.rs` 只被旧 client 使用 | 应该删除 | 中 |
| `openai.rs` 在根目录 | 应该移到 providers/openai/ | 中 |
| 测试仍使用旧的 `CopilotClientTrait` | 需要迁移到新的 Provider 架构 | 低 |

### 3. 跨 Provider 的共享代码

**需要共享的：**
- `common/sse.rs` - 所有 provider 都使用 SSE
- `common/openai_compat.rs` - Copilot 和 OpenAI 兼容格式
- `masking.rs` - 敏感信息掩码（可全局使用）
- `protocol/` - 协议转换逻辑

**Copilot 专有的：**
- `auth/` - OAuth 认证流程
- `client/models_handler.rs` - Copilot 模型管理
- Keyword masking（可移到 CopilotProvider）

## 重构计划

### Phase 1: 移动 Copilot Auth 到 Provider 内部

```rust
// 目标结构
providers/
└── copilot/
    ├── mod.rs              # CopilotProvider 实现
    ├── auth.rs             # 合并 auth/mod.rs + auth/handler.rs
    ├── token.rs            # CopilotToken 类型
    ├── device_code.rs      # 设备码流程
    └── cache.rs            # TokenCache
```

**步骤：**
1. 将 `auth/` 移动到 `providers/copilot/auth/`
2. 更新所有 `use crate::auth::` 到 `use crate::providers::copilot::auth::`
3. 简化 auth 模块暴露的接口

### Phase 2: 删除旧的 Client 代码

**可以删除的：**
- `client_trait.rs` - 不再使用
- `client/mod.rs` - 被新的 CopilotProvider 替代
- `client/models_handler.rs` - 移到 copilot provider 内
- `client/decorator.rs` - 如果不需要 metrics decorator 可以删除

**需要保留的：**
- `client/stream_tool_accumulator.rs` - 被其他模块使用

### Phase 3: 整合 OpenAI 代码

将 `openai.rs` 移动到 `providers/openai/compat.rs` 或合并到 `providers/openai/mod.rs`

### Phase 4: 清理 lib.rs 导出

移除不再需要的导出：
```rust
// 删除这些导出
pub use client::{CopilotClient, MetricsClientDecorator};
pub use client_trait::CopilotClientTrait;
```

### Phase 5: 更新测试

将测试文件从使用 `CopilotClientTrait` 改为使用 `LLMProvider` trait。

## 详细的文件迁移计划

### 1. Copilot Auth 迁移

```
auth/mod.rs → providers/copilot/auth/mod.rs
auth/handler.rs → 合并到 providers/copilot/auth/mod.rs
auth/cache.rs → providers/copilot/auth/cache.rs
auth/token.rs → providers/copilot/auth/token.rs
auth/device_code.rs → providers/copilot/auth/device_code.rs
```

### 2. Client 代码处理

```
client/mod.rs → 删除（功能已合并到 CopilotProvider）
client/models_handler.rs → providers/copilot/models.rs
client/decorator.rs → 可选保留为 providers/common/metrics_decorator.rs
client/stream_tool_accumulator.rs → 保持不动，或移到根目录
```

### 3. 根目录清理

```
openai.rs → 删除（内容已移到 providers/openai/）
client_trait.rs → 删除
models.rs → 保留（通用模型类型）
```

## 重构后的目标结构

```
agent-llm/src/
├── lib.rs                      # 清理后的导出
├── provider.rs                 # LLMProvider trait
├── provider_factory.rs         # Provider 工厂
├── error.rs                    # 错误类型
├── types.rs                    # 通用类型
├── masking.rs                  # 敏感信息掩码
├── models.rs                   # OpenAI 兼容模型类型
├── protocol/                   # 协议转换
│   ├── mod.rs
│   ├── errors.rs
│   ├── openai.rs
│   ├── anthropic.rs
│   └── gemini.rs
├── client/                     # 仅保留 stream_tool_accumulator
│   └── stream_tool_accumulator.rs
└── providers/
    ├── mod.rs
    ├── common/                 # 共享工具
    │   ├── mod.rs
    │   ├── sse.rs
    │   └── openai_compat.rs
    ├── copilot/               # Copilot Provider + Auth
    │   ├── mod.rs             # CopilotProvider 实现
    │   ├── auth/
    │   │   ├── mod.rs         # 认证逻辑
    │   │   ├── token.rs       # Token 类型
    │   │   ├── device_code.rs # 设备码流程
    │   │   └── cache.rs       # Token 缓存
    │   └── models.rs          # Copilot 模型管理
    ├── openai/                # OpenAI Provider
    │   └── mod.rs
    ├── anthropic/             # Anthropic Provider
    │   ├── mod.rs
    │   ├── stream.rs
    │   ├── conversion.rs
    │   └── api_types.rs
    └── gemini/                # Gemini Provider
        ├── mod.rs
        └── stream.rs
```

## 兼容性考虑

### 外部使用检查

需要检查是否有外部 crate 使用以下导出：

```rust
// lib.rs 当前导出
pub use auth::{CopilotAuthHandler, CopilotToken, TokenCache};
pub use client::{CopilotClient, MetricsClientDecorator};
pub use client_trait::CopilotClientTrait;
```

检查哪些 crate 依赖这些：
- `web_service` - 可能使用
- `src-tauri` - 可能使用
- 其他 crates?

### 迁移策略

1. **保持向后兼容** - 使用类型别名保持旧导出工作
2. **标记 deprecated** - 添加 `#[deprecated]` 属性
3. **逐步迁移** - 先移动代码，再更新引用，最后删除旧导出

## 开始重构吗？

建议按以下顺序：
1. 先完成 Phase 1 (Copilot Auth 迁移) - 影响最小
2. 再完成 Phase 2 (删除旧 Client) - 需要验证没有外部依赖
3. 最后清理 lib.rs 导出

要我立即开始执行这个重构计划吗？
