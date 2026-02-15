# 迁移到新 Provider 架构的计划

## 当前状况分析

### 1. web_service/src/server.rs

**现状**:
```rust
pub struct AppState {
    pub copilot_client: Arc<dyn CopilotClientTrait>,  // 旧的
    pub provider: Arc<RwLock<Arc<dyn LLMProvider>>>,  // 新的
    pub config: Arc<RwLock<Config>>,
}
```

**问题**: 同时存在旧的 copilot_client 和新的 provider

### 2. agent-server/src/state.rs

**现状**:
```rust
pub struct AppState {
    pub llm: Arc<dyn agent_llm::LLMProvider>,  // 独立创建
    // ...
}

impl AppState {
    pub async fn new_with_config(
        provider: &str,  // 手动传递
        llm_base_url: String,
        api_key: String,
        // ...
    ) -> Self {
        let llm = match provider {
            "openai" => Arc::new(OpenAIProvider::new(...)),
            "anthropic" => Arc::new(AnthropicProvider::new(...)),
            // ... 手动创建
        };
    }
}
```

**问题**: agent-server 独立创建 provider，没有使用配置系统

---

## 迁移目标

### 目标 1: 统一使用 Provider
- web_service 和 agent-server 共享同一个 provider
- 使用 Provider Factory 和配置系统
- 移除旧的 copilot_client

### 目标 2: 简化架构
- 移除重复的创建逻辑
- 统一配置源
- 支持热重载

---

## 迁移步骤

### Phase 1: 更新 AppState 结构

#### Step 1.1: web_service/src/server.rs

**移除**:
```rust
pub copilot_client: Arc<dyn CopilotClientTrait>,  // ❌ 删除
```

**保留**:
```rust
pub provider: Arc<RwLock<Arc<dyn LLMProvider>>>,  // ✅ 保留
pub config: Arc<RwLock<Config>>,                   // ✅ 保留
```

#### Step 1.2: agent-server/src/state.rs

**修改**:
```rust
pub struct AppState {
    // pub llm: Arc<dyn agent_llm::LLMProvider>,  // ❌ 删除
    pub provider: Arc<RwLock<Arc<dyn agent_llm::LLMProvider>>>,  // ✅ 添加
    // ...
}
```

---

### Phase 2: 更新初始化代码

#### Step 2.1: web_service/src/server.rs

**当前**:
```rust
let copilot_client = create_decorated_client(config.clone(), app_data_dir.clone(), metrics_bus.clone());

let state = AppState {
    copilot_client,  // ❌
    provider: Arc::new(RwLock::new(provider)),
    // ...
};
```

**改为**:
```rust
// 1. 创建初始 provider
let initial_provider = agent_llm::create_provider(&config)?;

// 2. 包装为可热重载
let provider = Arc::new(RwLock::new(initial_provider));

// 3. 创建 state
let state = AppState {
    provider,  // ✅
    app_data_dir,
    config: Arc::new(RwLock::new(config)),
};
```

#### Step 2.2: agent-server/src/state.rs

**当前**:
```rust
let llm = match provider {
    "openai" => Arc::new(OpenAIProvider::new(...)),
    // ...
};

AppState {
    llm,  // ❌
    // ...
}
```

**改为**:
```rust
impl AppState {
    pub async fn new_from_provider(
        provider: Arc<RwLock<Arc<dyn LLMProvider>>>,  // ✅ 从外部传入
        // ...
    ) -> Self {
        AppState {
            provider,  // ✅
            // ...
        }
    }
}
```

---

### Phase 3: 更新使用点

#### Step 3.1: 查找所有 copilot_client 使用

```bash
# 查找使用
grep -rn "copilot_client" crates/web_service/src/
```

**预期结果**: 应该只在新创建的地方使用（通过 provider）

#### Step 3.2: 查找所有 llm 使用

```bash
# 查找使用
grep -rn "\.llm\." crates/agent-server/src/
```

**改为**:
```rust
// 旧
let llm = &self.llm;

// 新
let llm = self.provider.read().await.clone();
```

---

### Phase 4: 更新 Controller

#### Step 4.1: controllers/*.rs

**当前**:
```rust
pub async fn handler(
    state: web::Data<AppState>,
) -> HttpResponse {
    let client = &state.copilot_client;  // ❌
    // ...
}
```

**改为**:
```rust
pub async fn handler(
    state: web::Data<AppState>,
) -> HttpResponse {
    let provider = state.provider.read().await.clone();  // ✅
    // ...
}
```

---

### Phase 5: 移除旧代码

#### Step 5.1: 移除 CopilotClientTrait 使用

**文件**:
- `web_service/src/server.rs`
- `controllers/*.rs`

**移除**:
```rust
use agent_llm::CopilotClientTrait;  // ❌
```

**保留**:
```rust
use agent_llm::LLMProvider;  // ✅
```

#### Step 5.2: 移除 create_decorated_client

**当前**:
```rust
fn create_decorated_client(
    config: Config,
    app_data_dir: PathBuf,
    metrics_bus: MetricsBus,
) -> Arc<dyn CopilotClientTrait> {
    let base_client = CopilotClient::new(config, app_data_dir);
    MetricsClientDecorator::new(base_client, metrics_bus, "openai.chat_completions")
}
```

**决策**:
- 如果需要 metrics，创建新的 decorator
- 或者将 metrics 集成到 provider 中

---

## 迁移后的架构

### 统一的 Provider 访问

```rust
// web_service AppState
pub struct AppState {
    pub provider: Arc<RwLock<Arc<dyn LLMProvider>>>,  // 统一入口
    pub config: Arc<RwLock<Config>>,
    pub app_data_dir: PathBuf,
}

// agent-server AppState
pub struct AppState {
    pub provider: Arc<RwLock<Arc<dyn LLMProvider>>>,  // 共享同一个
    pub sessions: Arc<RwLock<HashMap<String, Session>>>,
    // ...
}
```

### 配置驱动

```rust
// 初始化
let config = Config::new();
let provider = agent_llm::create_provider(&config)?;
let provider = Arc::new(RwLock::new(provider));

// web_service
let web_state = web_service::AppState {
    provider: provider.clone(),
    config: Arc::new(RwLock::new(config)),
    // ...
};

// agent-server
let agent_state = agent_server::AppState::new_from_provider(
    provider.clone(),
    // ...
).await;
```

### 热重载

```rust
// 重新加载配置
let new_config = Config::new();
let new_provider = agent_llm::create_provider(&new_config)?;

// 原子替换
let mut provider = state.provider.write().await;
*provider = new_provider;

// 所有服务自动使用新 provider
```

---

## 兼容性处理

### 1. CopilotClientTrait 方法

**如果某些代码必须使用 CopilotClientTrait**:

```rust
// 创建适配器
impl CopilotClientTrait for DynLLMProvider {
    // 实现 trait 方法，委托给 LLMProvider
}
```

**或者**: 逐步迁移所有使用点到 LLMProvider

### 2. 测试

**更新测试**:
```rust
// 旧
let client = CopilotClient::new(config, app_data_dir);

// 新
let provider = agent_llm::create_provider(&config)?;
```

---

## 迁移检查清单

### Backend

- [ ] **web_service/src/server.rs**
  - [ ] 移除 `copilot_client` 字段
  - [ ] 移除 `create_decorated_client` 函数
  - [ ] 更新初始化代码使用 `create_provider`

- [ ] **agent-server/src/state.rs**
  - [ ] 改为接收外部 provider
  - [ ] 移除独立的 provider 创建逻辑
  - [ ] 更新所有 `.llm` 使用为 `.provider`

- [ ] **controllers/**/*.rs**
  - [ ] 更新所有 `copilot_client` 使用为 `provider`
  - [ ] 更新错误处理

- [ ] **tests/**/*.rs**
  - [ ] 更新测试使用新的 provider 系统

### Frontend

- [ ] **前端无需改动**
  - 前端已经使用新的配置系统
  - API 端点保持不变

### 文档

- [ ] 更新架构文档
- [ ] 更新 API 文档
- [ ] 添加迁移指南

---

## 风险和缓解

### 风险 1: 破坏现有功能

**缓解**:
1. 逐步迁移，保持向后兼容
2. 完整的测试覆盖
3. 先在开发环境验证

### 风险 2: Metrics 丢失

**缓解**:
1. 创建新的 Provider Decorator
2. 或集成 metrics 到 provider 层

### 风险 3: 性能影响

**缓解**:
1. RwLock 读操作无锁
2. 基准测试验证
3. 优化热路径

---

## 时间估计

- **Phase 1-2**: 1 小时（结构更新）
- **Phase 3-4**: 2 小时（使用点更新）
- **Phase 5**: 1 小时（清理和测试）
- **总计**: 4-5 小时

---

## 执行建议

### 方案 A: 立即迁移（激进）

使用 Team Agent 一次性完成所有迁移。

**优点**: 快速，彻底
**缺点**: 风险较高，可能破坏功能

### 方案 B: 逐步迁移（稳妥）

分阶段迁移，每阶段测试验证。

**优点**: 风险低，可控
**缺点**: 时间长，需要维护两套代码

### 方案 C: 并行实现（推荐）

1. 创建新的迁移版本
2. 保留旧版本作为回退
3. 通过 feature flag 切换

**优点**: 安全，可回退
**缺点**: 代码重复

---

## 建议

**推荐**: 先完成 Phase 1-2（结构更新），测试验证后再进行 Phase 3-5。

这样可以：
1. 降低风险
2. 逐步验证
3. 保持系统稳定

要我现在开始执行迁移吗？
