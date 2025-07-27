# 内外部代码分离解决方案总结

## 🎯 问题解决

你的需求：在公司外部环境开发，然后快速同步到公司内部环境，避免手动合并的麻烦和错误。

## 🏗️ 解决方案设计

### 核心思路
1. **模块化分离**: 创建独立的 `internal` 模块包含所有公司特殊功能
2. **环境变量控制**: 使用 `COMPANY_INTERNAL=true` 控制是否启用内部功能
3. **自动注册**: 复用现有的 `auto_register_tool!` 和 `auto_register_category!` 宏
4. **选择性同步**: 前端直接覆盖，后端选择性复制

## 📁 实现的目录结构

```
src-tauri/src/internal/
├── mod.rs                    # 简单的模块声明
├── tools/                    # 内部工具
│   ├── bitbucket.rs         # Bitbucket API 访问
│   ├── confluence.rs        # Confluence 文档访问
│   └── mod.rs
├── categories/              # 内部工具类别
│   ├── company_tools.rs     # 公司工具类别
│   └── mod.rs
└── services/                # 内部服务
    ├── proxy.rs            # 代理配置
    ├── auth.rs             # 认证服务
    └── mod.rs
```

## 🔧 注册流程说明

### `auto_register_tool!` 宏的作用

1. **编译时收集**: 使用 `inventory` crate 在编译时自动收集工具注册信息
2. **零配置**: 不需要手动在任何地方注册工具
3. **自动发现**: `AutoToolRegistry::get_all_tools()` 自动获取所有注册的工具

### 完整的注册步骤

**对于工具 (Tools):**
1. 创建工具结构体并实现 `Tool` trait
2. 添加 `TOOL_NAME` 常量
3. 调用 `auto_register_tool!(YourTool)` 宏
4. 编译时自动收集到全局注册表
5. 运行时通过 `ToolManager` 自动可用

**对于类别 (Categories):**
1. 创建类别结构体并实现 `Category` trait
2. 添加 `CATEGORY_ID` 常量
3. 在 `required_tools()` 中声明需要的工具
4. 调用 `auto_register_category!(YourCategory)` 宏
5. 编译时自动收集到全局注册表
6. 运行时通过 `ToolManager` 自动可用

## 🚀 使用方法

### 外部环境（默认）
```bash
cargo build
cargo run
# 内部工具类别的 enable() 返回 false，工具不可用
```

### 公司内部环境
```bash
export COMPANY_INTERNAL=true
cargo build
cargo run
# 内部工具类别的 enable() 返回 true，工具可用
```

## 📋 代码同步工作流

### 从外部到公司内部
```bash
# 前端：直接覆盖
rm -rf src/ && cp -r /external/src/ ./src/

# 后端：选择性复制（保留 internal/ 目录）
rsync -av --exclude='internal/' /external/src-tauri/src/ ./src-tauri/src/
```

### 从公司内部到外部
```bash
# 后端：选择性复制（排除 internal/ 目录）
rsync -av --exclude='internal/' /company/src-tauri/src/ ./src-tauri/src/
```

## ✅ 实现的功能

### 内部工具
- **BitbucketTool**: 访问公司 Bitbucket 仓库、PR、代码搜索
- **ConfluenceTool**: 访问公司 Confluence 文档、搜索页面

### 内部类别
- **CompanyToolsCategory**: 管理公司特定工具，通过环境变量控制启用

### 内部服务
- **ProxyConfig**: 公司网络代理配置
- **AuthService**: 公司系统认证服务

## 🔑 关键设计点

1. **无需 feature flag**: 不使用 Rust 的 feature 系统，避免编译复杂性
2. **环境变量控制**: 通过 `COMPANY_INTERNAL` 环境变量控制功能启用
3. **自动注册**: 完全依赖现有的 `auto_register_*` 宏系统
4. **简化架构**: 移除复杂的 `InternalModule` trait，直接使用模块结构

## 🎉 优势

1. **零配置同步**: 前端代码可以直接覆盖
2. **选择性同步**: 后端代码选择性复制，保留内部功能
3. **完全兼容**: 复用现有工具系统架构
4. **运行时控制**: 通过环境变量动态控制功能启用
5. **易于维护**: 内部功能模块化，易于添加和修改

## 🔧 环境配置

### 公司内部环境变量
```bash
# 启用内部功能
export COMPANY_INTERNAL=true

# 代理设置
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=https://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.company.com

# 认证配置
export BITBUCKET_BASE_URL=https://bitbucket.company.com
export CONFLUENCE_BASE_URL=https://confluence.company.com
```

这个解决方案完美解决了你的需求：在外部环境快速开发，然后通过简单的文件操作同步到公司内部环境！
