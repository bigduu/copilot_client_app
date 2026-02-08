# Parameterized Registration Guide

When a tool or category's `new()` method requires parameters, we provide multiple solutions to handle this situation.

## Problem Background

The original `auto_register_tool!` and `auto_register_category!` macros assume all types have a parameterless `new()` method:

```rust
// This only works for parameterless constructors
auto_register_tool!(SimpleTool);  // Calls SimpleTool::new()
```

However, some tools or categories require configuration parameters:

```rust
// The original macro cannot handle this case
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

## Solutions

### Solution 1: Use `_with_constructor` Macros

The most direct solution is to use the new `auto_register_tool_with_constructor!` and `auto_register_category_with_constructor!` macros:

```rust
use crate::tool_system::auto_register_tool_with_constructor;

// Register tool with parameters
auto_register_tool_with_constructor!(
    ConfigurableTool,
    || Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
);
```

### Solution 2: Use `_advanced` Macros

A more flexible solution is to use the `auto_register_tool_advanced!` macro, which supports two syntaxes:

```rust
use crate::tool_system::auto_register_tool_advanced;

// No parameters (equivalent to original macro)
auto_register_tool_advanced!(SimpleTool);

// With parameters
auto_register_tool_advanced!(ConfigurableTool, || {
    Arc::new(ConfigurableTool::new(
        "https://api.example.com".to_string(),
        "secret-key".to_string()
    ))
});

// Read configuration from environment variables
auto_register_tool_advanced!(ConfigurableTool, || {
    let base_url = std::env::var("API_BASE_URL")
        .unwrap_or_else(|_| "https://api.example.com".to_string());
    let api_key = std::env::var("API_KEY")
        .unwrap_or_else(|_| "default-key".to_string());

    Arc::new(ConfigurableTool::new(base_url, api_key))
});
```

### Solution 3: Register in Initialization Function

For cases requiring runtime configuration, registration can be done in an initialization function:

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

### Solution 4: Provide Default Constructor

If possible, provide a parameterless `new()` method and a parameterized `with_config()` method for the type:

```rust
impl ConfigurableTool {
    pub const TOOL_NAME: &'static str = "configurable_tool";

    // Parameterless constructor using default values
    pub fn new() -> Self {
        Self::with_config(
            "https://api.example.com".to_string(),
            "default-key".to_string()
        )
    }

    // Parameterized constructor
    pub fn with_config(base_url: String, api_key: String) -> Self {
        Self { base_url, api_key }
    }
}

// Can now use the original macro
auto_register_tool!(ConfigurableTool);
```

## Category Registration Examples

Category parameterized registration follows the same pattern:

```rust
// Category without parameters
auto_register_category!(SimpleCategory);

// Category with parameters
auto_register_category_advanced!(ConfigurableCategory, || {
    Box::new(ConfigurableCategory::new(
        true,  // enabled
        10,    // max_tools
        "production".to_string()  // environment
    ))
});

// Read from configuration file
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

## Best Practices

1. **Prefer parameterless constructors**: If possible, design tools and categories to provide a parameterless `new()` method.

2. **Use `_advanced` macros**: For new code, recommend using `auto_register_tool_advanced!` and `auto_register_category_advanced!` macros as they are more flexible.

3. **Environment variable configuration**: For tools requiring environment-specific configuration, using environment variables is a good choice.

4. **Lazy registration**: For complex configuration scenarios, consider registering during application initialization rather than at compile time.

5. **Document parameters**: Ensure clear documentation of required parameters in tool and category documentation.

## Notes

- When using parameterized registration, ensure all required dependencies are available at registration time.
- Avoid operations that may fail in constructors, such as network requests or file I/O.
- Consider using configuration validation to ensure parameter validity.
- For sensitive information (like API keys), consider using secure configuration management solutions.
