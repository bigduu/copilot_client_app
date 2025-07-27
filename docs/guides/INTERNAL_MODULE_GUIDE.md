# Internal Module Implementation Guide

## 🎯 解决方案概述

我已经为你设计并实现了一个完整的内外部代码分离解决方案。这个方案通过模块化设计和条件编译，完美解决了你在公司内外环境之间同步代码的问题。

## 🏗️ 架构设计

### 核心思想
1. **完全分离**: 内部代码完全独立于外部代码
2. **条件编译**: 使用 Rust 的 feature flag 控制是否包含内部功能
3. **统一接口**: 通过 `InternalModule` trait 提供统一的注册接口
4. **自动注册**: 复用现有的工具自动注册系统

### 目录结构
```
src-tauri/src/
├── internal/                    # 🏢 公司内部模块
│   ├── mod.rs                  # 主模块和 InternalModule trait
│   ├── tools/                  # 内部工具
│   │   ├── bitbucket.rs        # Bitbucket API 访问
│   │   ├── confluence.rs       # Confluence 文档访问
│   │   └── mod.rs
│   ├── categories/             # 内部工具类别
│   │   ├── company_tools.rs    # 公司工具类别
│   │   └── mod.rs
│   ├── services/               # 内部服务
│   │   ├── proxy.rs            # 代理配置
│   │   ├── auth.rs             # 认证服务
│   │   └── mod.rs
│   └── README.md               # 详细使用说明
├── tools/                      # 🌍 公共工具系统
├── lib.rs                      # 主库文件（已集成内部模块）
└── ...
```

## 🚀 使用方法

### 外部环境（默认）
```bash
# 构建（不包含内部功能）
cargo build

# 运行
cargo run
```
- ✅ 只包含公共工具和功能
- ✅ 完全不包含任何内部代码
- ✅ 可以安全地在外部环境使用

### 公司内部环境
```bash
# 构建（包含内部功能）
cargo build --features internal

# 运行
cargo run --features internal
```
- ✅ 包含所有内部工具（Bitbucket、Confluence 等）
- ✅ 包含内部服务（代理、认证等）
- ✅ 可以访问公司内部系统

## 📋 代码同步工作流

### 从外部到公司内部

1. **前端代码**（完全一样）:
```bash
# 在公司环境中
rm -rf src/
cp -r /path/to/external/src/ ./src/
```

2. **后端代码**（选择性复制）:
```bash
# 在公司环境中
# 复制除了 internal/ 之外的所有内容
rsync -av --exclude='internal/' /path/to/external/src-tauri/src/ ./src-tauri/src/

# internal/ 目录保持不变，包含你的公司特殊功能
```

### 从公司内部到外部

1. **前端代码**:
```bash
# 在外部环境中
cp -r /path/to/company/src/ ./src/
```

2. **后端代码**:
```bash
# 在外部环境中
# 复制除了 internal/ 之外的所有内容
rsync -av --exclude='internal/' /path/to/company/src-tauri/src/ ./src-tauri/src/
```

## 🛠️ 已实现的功能

### 1. 内部工具
- **BitbucketTool**: 访问公司 Bitbucket 仓库、PR、代码搜索
- **ConfluenceTool**: 访问公司 Confluence 文档、搜索页面

### 2. 内部工具类别
- **CompanyToolsCategory**: 管理所有公司特定工具

### 3. 内部服务
- **ProxyConfig**: 公司代理配置
- **AuthService**: 公司系统认证服务

### 4. 自动注册系统
- 所有内部工具和类别都使用现有的自动注册系统
- 只在 `internal` feature 启用时注册

## 🔧 配置说明

### Cargo.toml 配置

**外部环境**:
```toml
[features]
default = []  # 默认不启用内部功能
internal = []
```

**公司内部环境**:
```toml
[features]
default = ["internal"]  # 默认启用内部功能
internal = []
```

### 环境变量配置

公司内部环境需要设置以下环境变量：
```bash
# 代理设置
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=https://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.company.com

# 认证配置
export BITBUCKET_BASE_URL=https://bitbucket.company.com
export CONFLUENCE_BASE_URL=https://confluence.company.com
export AUTH_ENDPOINT=https://auth.company.com/oauth/token
export CLIENT_ID=copilot-chat-client
```

## 📝 添加新的内部功能

### 添加新工具

1. 在 `src-tauri/src/internal/tools/` 创建新工具文件
2. 实现 `Tool` trait
3. 使用 `auto_register_tool!` 宏注册
4. 在类别中添加工具名称

### 添加新服务

1. 在 `src-tauri/src/internal/services/` 创建服务文件
2. 在 `setup_company_services_sync` 中注册服务
3. 通过 Tauri 状态管理系统管理服务

## 🔒 安全特性

1. **条件编译保护**: 所有内部代码都用 `#[cfg(feature = "internal")]` 保护
2. **完全隔离**: 外部构建完全不包含内部代码
3. **环境变量配置**: 敏感信息通过环境变量配置，不硬编码
4. **服务隔离**: 内部服务与公共服务分离管理

## ✅ 优势总结

1. **零配置同步**: 前端代码可以直接覆盖
2. **选择性同步**: 后端代码可以选择性复制，保留内部功能
3. **完全兼容**: 复用现有的工具系统架构
4. **类型安全**: 使用 Rust 的类型系统和条件编译确保安全
5. **易于维护**: 内部功能模块化，易于添加和修改
6. **构建灵活**: 可以选择是否包含内部功能

## 🎉 使用效果

- **外部开发**: 你可以在外部环境快速开发和测试功能
- **内部部署**: 在公司内部环境可以访问所有内部系统
- **代码同步**: 通过简单的文件复制就能同步代码
- **功能隔离**: 内外部功能完全隔离，互不影响

这个解决方案完美解决了你的需求，让你可以在外部环境借助 AI 快速开发，然后轻松同步到公司内部环境！
