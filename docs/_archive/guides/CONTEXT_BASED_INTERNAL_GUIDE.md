# Context-Based Internal Module 设计指南

## 🎯 设计思路

基于你的需求，我们设计了一个基于 Context 的内部模块系统：

1. **注册中心架构**: Tools 和 Categories 都有各自的注册中心
2. **Context 模式**: 通过 context 传递必要的依赖和配置
3. **外部文件控制**: 实际的初始化逻辑在外部文件中实现
4. **参数化构造**: Tools 和 Categories 可以接受参数

## 🏗️ 架构设计

### 核心组件

```rust
// 1. Internal Context - 包含所有必要的依赖
pub struct InternalContext<R: Runtime> {
    pub app: *mut App<R>,                              // Tauri app 引用
    pub config: InternalConfig,                        // 配置信息
    pub tool_registry: Arc<dyn ToolRegistry>,          // 工具注册中心
    pub category_registry: Arc<dyn CategoryRegistry>,  // 类别注册中心
}

// 2. Tool Registry - 工具注册中心
pub trait ToolRegistry {
    fn register_tool(&self, name: &str, constructor: Box<dyn Fn(&InternalConfig) -> Arc<dyn Tool>>);
    fn get_tool(&self, name: &str, config: &InternalConfig) -> Option<Arc<dyn Tool>>;
}

// 3. Category Registry - 类别注册中心  
pub trait CategoryRegistry {
    fn register_category(&self, id: &str, constructor: Box<dyn Fn(&InternalConfig) -> Box<dyn Category>>);
    fn get_category(&self, id: &str, config: &InternalConfig) -> Option<Box<dyn Category>>;
}
```

### 注册流程

```mermaid
graph TD
    A[App Setup] --> B[Create InternalContext]
    B --> C[Load InternalConfig from env]
    B --> D[Create Tool Registry]
    B --> E[Create Category Registry]
    B --> F[Call init_internal(context)]
    F --> G{company_init.rs exists?}
    G -->|Yes| H[Call company_init::init(context)]
    G -->|No| I[Log: Context ready, implement init]
    H --> J[Register Tools with params]
    H --> K[Register Categories with params]
    H --> L[Setup Services]
```

## 📁 文件结构

```
src-tauri/src/internal/
├── mod.rs                           # Context 定义和核心逻辑
├── company_init.rs.example          # 示例实现文件
├── company_init.rs                  # 实际实现（仅公司环境）
├── tools/                           # 基础工具定义
├── categories/                      # 基础类别定义
└── services/                        # 基础服务定义
```

## 🚀 使用方法

### 1. 外部环境（默认）

```bash
cargo build
cargo run
# 输出: Internal module available but not enabled (COMPANY_INTERNAL != true)
```

### 2. 公司内部环境

```bash
export COMPANY_INTERNAL=true
export BITBUCKET_BASE_URL=https://bitbucket.company.com
export CONFLUENCE_BASE_URL=https://confluence.company.com

# 创建实际的初始化文件
cp src/internal/company_init.rs.example src/internal/company_init.rs

cargo build
cargo run
# 输出: Company initialization completed successfully
```

## 🔧 实现 company_init.rs

在公司环境中，创建 `src/internal/company_init.rs`：

```rust
use super::{InternalContext, InternalConfig};
use std::sync::Arc;
use tauri::Runtime;

pub fn init<R: Runtime>(context: InternalContext<R>) -> Result<(), Box<dyn std::error::Error>> {
    // 1. 注册带参数的工具
    context.tool_registry.register_tool(
        "bitbucket",
        Box::new(|config: &InternalConfig| {
            Arc::new(CompanyBitbucketTool::new(config.bitbucket_base_url.clone()))
        })
    );
    
    // 2. 注册带参数的类别
    context.category_registry.register_category(
        "company_tools",
        Box::new(|config: &InternalConfig| {
            Box::new(CompanyToolsCategory::new(config.clone()))
        })
    );
    
    // 3. 设置服务
    unsafe {
        let app = context.app();
        app.manage(CompanyService::new(&context.config));
    }
    
    Ok(())
}
```

## 📋 代码同步工作流

### 从外部到公司内部

```bash
# 1. 前端：直接覆盖
rm -rf src/ && cp -r /external/src/ ./src/

# 2. 后端：选择性复制（保留 company_init.rs）
rsync -av --exclude='internal/company_init.rs' /external/src-tauri/src/ ./src-tauri/src/

# 3. company_init.rs 保持不变，包含公司特殊逻辑
```

### 从公司内部到外部

```bash
# 后端：选择性复制（排除 company_init.rs）
rsync -av --exclude='internal/company_init.rs' /company/src-tauri/src/ ./src-tauri/src/
```

## ✅ 核心优势

### 1. 完全分离
- 外部环境：没有 `company_init.rs`，内部功能不可用
- 公司环境：有 `company_init.rs`，内部功能完全可用

### 2. 参数化构造
```rust
// 工具可以接受配置参数
Arc::new(BitbucketTool::new(config.bitbucket_base_url.clone()))

// 类别可以接受配置参数
Box::new(CompanyToolsCategory::new(config.clone()))
```

### 3. 灵活的注册中心
```rust
// 手动注册工具
tool_registry.register_tool("my_tool", Box::new(|config| {
    Arc::new(MyTool::new(config.some_param.clone()))
}));

// 手动注册类别
category_registry.register_category("my_category", Box::new(|config| {
    Box::new(MyCategory::new(config.clone()))
}));
```

### 4. 统一的 Context
```rust
// 所有必要的依赖都在 context 中
pub struct InternalContext<R: Runtime> {
    pub app: *mut App<R>,                    // 访问 Tauri app
    pub config: InternalConfig,              // 环境配置
    pub tool_registry: Arc<dyn ToolRegistry>,    // 工具注册
    pub category_registry: Arc<dyn CategoryRegistry>, // 类别注册
}
```

## 🔑 关键特性

1. **零配置同步**: 前端代码直接覆盖
2. **选择性同步**: 后端保留 `company_init.rs`
3. **参数化工具**: 工具和类别可以接受配置参数
4. **运行时注册**: 通过注册中心动态注册
5. **Context 传递**: 统一的依赖注入机制

## 🎉 使用效果

- **外部开发**: 快速开发，内部功能不干扰
- **内部部署**: 实现 `company_init.rs`，获得完整功能
- **代码同步**: 简单的文件操作即可同步
- **功能隔离**: 内外部功能完全分离

这个设计完美解决了你的需求：通过 Context 模式提供灵活的依赖注入，通过外部文件控制内部功能的启用！
