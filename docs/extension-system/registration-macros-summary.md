# 注册宏总结

## 问题

原始的 `auto_register_tool!` 和 `auto_register_category!` 宏只支持无参数的 `new()` 方法：

```rust
// ✅ 这样可以工作
impl SimpleTool {
    pub fn new() -> Self { Self }
}
auto_register_tool!(SimpleTool);

// ❌ 这样不行
impl ConfigurableTool {
    pub fn new(url: String, key: String) -> Self { 
        Self { url, key } 
    }
}
auto_register_tool!(ConfigurableTool); // 编译错误！
```

## 解决方案

我们提供了多种宏来处理不同的注册需求：

### 1. 原始宏（无参数）

```rust
auto_register_tool!(SimpleTool);
auto_register_category!(SimpleCategory);
```

**适用场景**: 工具/类别有无参数的 `new()` 方法

### 2. 带构造函数的宏

```rust
auto_register_tool_with_constructor!(
    ConfigurableTool,
    || Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
);

auto_register_category_with_constructor!(
    ConfigurableCategory,
    || Box::new(ConfigurableCategory::new(true, 10))
);
```

**适用场景**: 需要传递固定参数的工具/类别

### 3. 高级宏（推荐）

```rust
// 无参数（等同于原始宏）
auto_register_tool_advanced!(SimpleTool);

// 带参数
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
});

// 从环境变量读取
auto_register_tool_advanced!(EnvironmentTool, || {
    let url = std::env::var("API_URL").unwrap_or_default();
    Arc::new(EnvironmentTool::new(url))
});
```

**适用场景**: 所有场景，最灵活的选择

## 使用模式

### 模式 1: 默认构造函数 + 配置方法

```rust
impl ConfigurableTool {
    // 提供默认构造函数
    pub fn new() -> Self {
        Self::with_config("default".to_string())
    }
    
    // 提供配置构造函数
    pub fn with_config(config: String) -> Self {
        Self { config }
    }
}

// 可以使用原始宏
auto_register_tool!(ConfigurableTool);

// 或者使用高级宏进行自定义
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::with_config("custom".to_string()))
});
```

### 模式 2: 环境变量配置

```rust
auto_register_tool_advanced!(DatabaseTool, || {
    let host = std::env::var("DB_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("DB_PORT")
        .unwrap_or_else(|_| "5432".to_string())
        .parse()
        .unwrap_or(5432);
    
    Arc::new(DatabaseTool::new(host, port))
});
```

### 模式 3: 配置文件读取

```rust
auto_register_tool_advanced!(ApiTool, || {
    let config = load_config_file().unwrap_or_default();
    Arc::new(ApiTool::new(config.api_url, config.api_key))
});
```

### 模式 4: 条件注册

```rust
// 编译时条件
#[cfg(feature = "advanced-tools")]
auto_register_tool!(AdvancedTool);

// 运行时条件（需要修改注册系统支持）
// auto_register_tool_advanced!(ConditionalTool, || {
//     if should_enable_tool() {
//         Arc::new(ConditionalTool::new())
//     } else {
//         // 需要支持 Option<Arc<dyn Tool>> 返回类型
//     }
// });
```

## 最佳实践

1. **优先使用 `auto_register_tool_advanced!`**: 它支持所有场景，语法统一。

2. **提供默认构造函数**: 如果可能，为工具提供无参数的 `new()` 方法。

3. **使用环境变量**: 对于配置参数，优先使用环境变量而不是硬编码。

4. **错误处理**: 在构造函数中避免可能失败的操作，或提供合理的默认值。

5. **文档化**: 清楚地文档化工具需要的配置参数。

## 迁移指南

### 从原始宏迁移

```rust
// 旧代码
auto_register_tool!(MyTool);

// 新代码（完全兼容）
auto_register_tool_advanced!(MyTool);
```

### 添加参数支持

```rust
// 旧代码
impl MyTool {
    pub fn new() -> Self { Self }
}
auto_register_tool!(MyTool);

// 新代码
impl MyTool {
    pub fn new() -> Self {
        Self::with_config("default".to_string())
    }
    
    pub fn with_config(config: String) -> Self {
        Self { config }
    }
}

// 可以选择保持兼容
auto_register_tool!(MyTool);

// 或者使用新功能
auto_register_tool_advanced!(MyTool, || {
    Arc::new(MyTool::with_config(
        std::env::var("MY_TOOL_CONFIG").unwrap_or_default()
    ))
});
```

## 注意事项

- 构造函数闭包在应用启动时执行，确保所需的依赖已经可用
- 避免在构造函数中进行耗时操作
- 对于敏感配置，使用安全的配置管理方案
- 考虑配置验证和错误处理
