# 参数化注册指南

当工具或类别的 `new()` 方法需要参数时，我们提供了多种解决方案来处理这种情况。

## 问题背景

原始的 `auto_register_tool!` 和 `auto_register_category!` 宏假设所有类型都有无参数的 `new()` 方法：

```rust
// 这只适用于无参数构造函数
auto_register_tool!(SimpleTool);  // 调用 SimpleTool::new()
```

但是有些工具或类别需要配置参数：

```rust
// 这种情况下原始宏无法处理
pub struct ConfigurableTool {
    base_url: String,
    api_key: String,
}

impl ConfigurableTool {
    pub fn new(base_url: String, api_key: String) -> Self {
        Self { base_url, api_key }
    }
}
```

## 解决方案

### 方案 1: 使用 `_with_constructor` 宏

最直接的解决方案是使用新的 `auto_register_tool_with_constructor!` 和 `auto_register_category_with_constructor!` 宏：

```rust
use crate::tool_system::auto_register_tool_with_constructor;

// 注册带参数的工具
auto_register_tool_with_constructor!(
    ConfigurableTool,
    || Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
);
```

### 方案 2: 使用 `_advanced` 宏

更灵活的解决方案是使用 `auto_register_tool_advanced!` 宏，它支持两种语法：

```rust
use crate::tool_system::auto_register_tool_advanced;

// 无参数（等同于原始宏）
auto_register_tool_advanced!(SimpleTool);

// 带参数
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
});

// 从环境变量读取配置
auto_register_tool_advanced!(ConfigurableTool, || {
    let base_url = std::env::var("API_BASE_URL")
        .unwrap_or_else(|_| "https://api.example.com".to_string());
    let api_key = std::env::var("API_KEY")
        .unwrap_or_else(|_| "default-key".to_string());
    
    Arc::new(ConfigurableTool::new(base_url, api_key))
});
```

### 方案 3: 在初始化函数中注册

对于需要运行时配置的情况，可以在初始化函数中进行注册：

```rust
pub fn init_tools(config: &AppConfig) {
    auto_register_tool_with_constructor!(
        ConfigurableTool,
        || Arc::new(ConfigurableTool::new(
            config.api_base_url.clone(),
            config.api_key.clone()
        ))
    );
}
```

### 方案 4: 提供默认构造函数

如果可能，为类型提供一个无参数的 `new()` 方法和一个带参数的 `with_config()` 方法：

```rust
impl ConfigurableTool {
    pub const TOOL_NAME: &'static str = "configurable_tool";
    
    // 无参数构造函数，使用默认值
    pub fn new() -> Self {
        Self::with_config(
            "https://api.example.com".to_string(),
            "default-key".to_string()
        )
    }
    
    // 带参数的构造函数
    pub fn with_config(base_url: String, api_key: String) -> Self {
        Self { base_url, api_key }
    }
}

// 现在可以使用原始宏
auto_register_tool!(ConfigurableTool);
```

## 类别注册示例

类别的参数化注册遵循相同的模式：

```rust
// 无参数类别
auto_register_category!(SimpleCategory);

// 带参数类别
auto_register_category_advanced!(ConfigurableCategory, || {
    Box::new(ConfigurableCategory::new(
        true,  // enabled
        10,    // max_tools
        "production".to_string()  // environment
    ))
});

// 从配置文件读取
auto_register_category_with_constructor!(
    ConfigurableCategory,
    || {
        let config = load_config();
        Box::new(ConfigurableCategory::new(
            config.enabled,
            config.max_tools,
            config.environment
        ))
    }
);
```

## 最佳实践

1. **优先使用无参数构造函数**: 如果可能，设计工具和类别时提供无参数的 `new()` 方法。

2. **使用 `_advanced` 宏**: 对于新代码，推荐使用 `auto_register_tool_advanced!` 和 `auto_register_category_advanced!` 宏，因为它们更灵活。

3. **环境变量配置**: 对于需要环境特定配置的工具，使用环境变量是一个好选择。

4. **延迟注册**: 对于复杂的配置场景，考虑在应用初始化时进行注册，而不是在编译时。

5. **文档化参数**: 确保在工具和类别的文档中清楚说明所需的参数。

## 注意事项

- 使用参数化注册时，确保所有必需的依赖在注册时都可用。
- 避免在构造函数中进行可能失败的操作，如网络请求或文件 I/O。
- 考虑使用配置验证来确保参数的有效性。
- 对于敏感信息（如 API 密钥），考虑使用安全的配置管理方案。
