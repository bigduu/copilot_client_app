# 测试文档

本目录包含项目的测试相关文档，涵盖测试策略、测试指南和最佳实践。

## 📋 当前测试状态

### 测试覆盖率概览
- **tool_system**: 16 个测试通过 (registry, executor, tools)
- **context_manager**: 37 个测试通过 (FSM, context, branches, messages, serialization)
- **web_service**: 3 个现有集成测试通过
- **reqwest-sse**: 3 个现有 e2e 测试通过
- **总计**: 60 个测试通过

### 扩展系统测试
- **工具注册**: 所有工具通过 `auto_register_tool!` 宏正确注册
- **类别配置**: General Assistant 和 Translate 类别正常运行
- **工具访问**: General Assistant 可以访问所有8个工具
- **翻译功能**: Translate 类别提供纯翻译服务

### 新增测试套件
- **Registry Tests**: 测试工具注册、检索、并发访问
- **Executor Tests**: 测试工具执行、错误处理、并发执行
- **Tool Tests**: 测试文件操作、命令执行、错误处理
- **FSM Tests**: 测试所有状态转换、重试逻辑、错误处理
- **Context Tests**: 测试上下文创建、配置、克隆
- **Branch Tests**: 测试分支管理、消息隔离
- **Message Tests**: 测试消息操作、关系、元数据
- **Serialization Tests**: 测试 JSON 序列化/反序列化

## 🧪 测试策略

### 单元测试
- **工具测试**: 每个工具的功能测试
- **类别测试**: 类别配置和工具访问测试
- **注册测试**: 自动注册机制测试

### 集成测试
- **端到端测试**: 完整的用户交互流程测试
- **API测试**: 前后端接口测试
- **工具调用测试**: 工具调用流程测试

## 📖 测试指南

### 运行测试
```bash
# 运行所有测试
cargo test

# 运行所有 crate 的测试
cargo test --all

# 运行特定 crate 的测试
cargo test -p tool_system
cargo test -p context_manager

# 运行特定测试文件
cargo test --test registry_tests
cargo test --test fsm_tests

# 运行集成测试
cargo test --test integration
```

### 测试覆盖率
- 目标覆盖率: 80%+
- 关键模块: 100%覆盖
- 定期生成覆盖率报告

## 🔧 测试工具

- **Rust测试框架**: 内置测试框架
- **Mock工具**: 用于模拟外部依赖
- **集成测试**: Tauri测试工具

这些测试确保系统的稳定性和可靠性，为持续集成和部署提供保障。

## 🧪 文档分类

- **测试规范**: 测试分类、标准和最佳实践
- **测试报告**: 具体测试的执行结果和分析
- **重构测试**: 代码重构后的测试验证文档

## 🔄 维护

测试文档应与代码变更同步更新，确保测试用例的有效性和测试结果的准确性。新增功能或修复问题时，应及时补充相应的测试文档。

## 📊 测试覆盖

建议定期回顾测试文档，确保：
- 测试用例覆盖核心功能
- 测试结果真实反映系统状态
- 测试文档格式统一、内容完整