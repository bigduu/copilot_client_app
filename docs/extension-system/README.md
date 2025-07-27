# 扩展系统文档

本目录包含项目扩展系统相关的文档，涵盖工具注册、类别管理、参数化构造等核心功能。

## 📋 文档列表

### 核心机制
- [`registration-macros-summary.md`](./registration-macros-summary.md) - 注册宏总结和使用指南
- [`parameterized-registration-guide.md`](./parameterized-registration-guide.md) - 参数化注册详细指南

### 类别和工具
- [`translate-category-guide.md`](./translate-category-guide.md) - 翻译类别使用指南
- [`general-assistant-tools-fix.md`](./general-assistant-tools-fix.md) - General Assistant 工具访问权限修复

## 🏗️ 扩展系统架构

### 注册机制
- **自动注册**: 使用 `auto_register_tool!` 和 `auto_register_category!` 宏
- **参数化注册**: 支持带参数的构造函数
- **全局注册表**: 基于 `inventory` crate 的编译时收集

### 核心组件
- **Tools**: 具体功能实现，通过 `Tool` trait 定义接口
- **Categories**: 工具分组管理，通过 `Category` trait 定义接口
- **ToolsManager**: 统一管理工具和类别的生命周期

## 🔧 使用场景

### 工具开发
1. 实现 `Tool` trait
2. 添加 `TOOL_NAME` 常量
3. 使用注册宏进行注册

### 类别开发
1. 实现 `Category` trait
2. 添加 `CATEGORY_ID` 常量
3. 在 `required_tools()` 中声明需要的工具
4. 使用注册宏进行注册

### 参数化构造
- 使用 `auto_register_tool_with_constructor!` 传递固定参数
- 使用 `auto_register_tool_advanced!` 支持动态配置
- 从环境变量或配置文件读取参数

## 📖 快速开始

### 创建简单工具
```rust
#[derive(Debug)]
pub struct MyTool;

impl MyTool {
    pub const TOOL_NAME: &'static str = "my_tool";
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for MyTool {
    // 实现必要的方法
}

// 注册工具
auto_register_tool!(MyTool);
```

### 创建带参数的工具
```rust
auto_register_tool_advanced!(ConfigurableTool, || {
    let config = load_config();
    Arc::new(ConfigurableTool::new(config.url, config.key))
});
```

## 🎯 最佳实践

1. **优先使用高级宏**: `auto_register_tool_advanced!` 提供最大灵活性
2. **环境变量配置**: 避免硬编码配置参数
3. **错误处理**: 在构造函数中提供合理的默认值
4. **文档化**: 清楚说明工具的参数和用法

## 🔗 相关文档

- [架构文档](../architecture/) - 系统整体架构设计
- [开发指南](../development/) - 开发规范和最佳实践
- [配置文档](../configuration/) - 系统配置和提示词管理
