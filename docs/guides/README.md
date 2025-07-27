# 指南文档

本目录包含项目的各种指南文档，涵盖内部模块开发、解决方案总结等。

## 📋 文档列表

### 解决方案总结
- [`FINAL_SOLUTION_SUMMARY.md`](./FINAL_SOLUTION_SUMMARY.md) - 最终解决方案总结
- [`INTERNAL_SOLUTION_SUMMARY.md`](./INTERNAL_SOLUTION_SUMMARY.md) - 内部解决方案总结

### 开发指南
- [`CONTEXT_BASED_INTERNAL_GUIDE.md`](./CONTEXT_BASED_INTERNAL_GUIDE.md) - 基于上下文的内部开发指南
- [`INTERNAL_MODULE_GUIDE.md`](./INTERNAL_MODULE_GUIDE.md) - 内部模块开发指南

## 🎯 指南概览

### 内部模块开发
- **Context 模式**: 通过上下文传递依赖和配置
- **注册中心架构**: Tools 和 Categories 的独立注册
- **参数化构造**: 支持带参数的工具和类别构造
- **环境变量控制**: 通过环境变量控制功能启用

### 解决方案架构
- **双重注册系统**: 自动注册 + 手动注册
- **外部文件控制**: 实际初始化逻辑在外部文件中实现
- **代码同步工作流**: 支持外部和内部环境的代码同步

## 🏗️ 核心设计原则

### 1. 模块化设计
- 清晰的模块边界
- 独立的功能单元
- 可插拔的组件架构

### 2. 配置驱动
- 环境变量控制功能
- 外部配置文件支持
- 运行时配置更新

### 3. 扩展性
- 简单的扩展接口
- 自动发现机制
- 插件式架构

## 📖 使用场景

### 内部工具开发
1. 创建工具实现
2. 使用 Context 传递配置
3. 通过注册宏自动注册
4. 环境变量控制启用

### 公司特定功能
1. 在 `internal/` 目录下开发
2. 使用 `COMPANY_INTERNAL` 环境变量控制
3. 保持与外部版本的兼容性

### 代码同步
1. 使用 rsync 进行选择性同步
2. 保留公司特定文件
3. 维护版本一致性

## 🔧 开发工作流

### 外部环境开发
```bash
# 正常开发流程
cargo build
cargo run
# 内部功能不可用
```

### 公司内部环境
```bash
# 启用内部功能
export COMPANY_INTERNAL=true
cargo build
cargo run
# 内部功能可用
```

### 代码同步
```bash
# 从外部到内部
rsync -av --exclude='internal/company_init.rs' /external/src-tauri/src/ ./src-tauri/src/

# 从内部到外部
rsync -av --exclude='internal/' /company/src-tauri/src/ ./src-tauri/src/
```

## 🎉 核心优势

1. **无需 feature flag**: 避免编译复杂性
2. **环境变量控制**: 简单的功能开关
3. **自动注册**: 零配置的组件发现
4. **简化架构**: 直接的模块结构

## 🔗 相关文档

- [扩展系统](../extension-system/) - 工具和类别的注册机制
- [架构文档](../architecture/) - 系统整体架构设计
- [配置文档](../configuration/) - 系统配置和环境变量
