# Registration Macros Summary

## Problem

The original `auto_register_tool!` and `auto_register_category!` macros only support parameterless `new()` methods:

```rust
// ✅ This works
impl SimpleTool {
    pub fn new() -> Self { Self }
}
auto_register_tool!(SimpleTool);

// ❌ This doesn't work
impl ConfigurableTool {
    pub fn new(url: String, key: String) -> Self {
        Self { url, key }
    }
}
auto_register_tool!(ConfigurableTool); // Compilation error!
```

## Solutions

We provide multiple macros to handle different registration needs:

### 1. Original Macros (No Parameters)

```rust
auto_register_tool!(SimpleTool);
auto_register_category!(SimpleCategory);
```

**Applicable Scenarios**: Tools/categories with parameterless `new()` methods

### 2. Macros with Constructor

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

**Applicable Scenarios**: Tools/categories requiring fixed parameters

### 3. Advanced Macros (Recommended)

```rust
// No parameters (equivalent to original macro)
auto_register_tool_advanced!(SimpleTool);

// With parameters
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
});

// Read from environment variables
auto_register_tool_advanced!(EnvironmentTool, || {
    let url = std::env::var("API_URL").unwrap_or_default();
    Arc::new(EnvironmentTool::new(url))
});
```

**Applicable Scenarios**: All scenarios, the most flexible choice

## Usage Patterns

### Pattern 1: Default Constructor + Configuration Method

```rust
impl ConfigurableTool {
    // Provide default constructor
    pub fn new() -> Self {
        Self::with_config("default".to_string())
    }

    // Provide configuration constructor
    pub fn with_config(config: String) -> Self {
        Self { config }
    }
}

// Can use original macro
auto_register_tool!(ConfigurableTool);

// Or use advanced macro for customization
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::with_config("custom".to_string()))
});
```

### Pattern 2: Environment Variable Configuration

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

### Pattern 3: Configuration File Reading

```rust
auto_register_tool_advanced!(ApiTool, || {
    let config = load_config_file().unwrap_or_default();
    Arc::new(ApiTool::new(config.api_url, config.api_key))
});
```

### Pattern 4: Conditional Registration

```rust
// Compile-time condition
#[cfg(feature = "advanced-tools")]
auto_register_tool!(AdvancedTool);

// Runtime condition (requires registration system modification)
// auto_register_tool_advanced!(ConditionalTool, || {
//     if should_enable_tool() {
//         Arc::new(ConditionalTool::new())
//     } else {
//         // Need to support Option<Arc<dyn Tool>> return type
//     }
// });
```

## Best Practices

1. **Prefer `auto_register_tool_advanced!`**: It supports all scenarios with unified syntax.

2. **Provide default constructor**: If possible, provide a parameterless `new()` method for tools.

3. **Use environment variables**: For configuration parameters, prefer environment variables over hardcoding.

4. **Error handling**: Avoid operations that may fail in constructors, or provide reasonable default values.

5. **Documentation**: Clearly document the configuration parameters required by tools.

## Migration Guide

### Migrating from Original Macros

```rust
// Old code
auto_register_tool!(MyTool);

// New code (fully compatible)
auto_register_tool_advanced!(MyTool);
```

### Adding Parameter Support

```rust
// Old code
impl MyTool {
    pub fn new() -> Self { Self }
}
auto_register_tool!(MyTool);

// New code
impl MyTool {
    pub fn new() -> Self {
        Self::with_config("default".to_string())
    }

    pub fn with_config(config: String) -> Self {
        Self { config }
    }
}

// Can choose to maintain compatibility
auto_register_tool!(MyTool);

// Or use new features
auto_register_tool_advanced!(MyTool, || {
    Arc::new(MyTool::with_config(
        std::env::var("MY_TOOL_CONFIG").unwrap_or_default()
    ))
});
```

## Notes

- Constructor closures execute at application startup, ensure required dependencies are available
- Avoid time-consuming operations in constructors
- For sensitive configurations, use secure configuration management solutions
- Consider configuration validation and error handling
