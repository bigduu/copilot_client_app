# Extension System Documentation

This directory contains documentation related to the project's extension system, covering core features such as tool registration, category management, and parameterized construction.

## 📋 Document List

### Core Mechanisms
- [`registration-macros-summary.md`](./registration-macros-summary.md) - Registration macros summary and usage guide
- [`parameterized-registration-guide.md`](./parameterized-registration-guide.md) - Parameterized registration detailed guide

### Categories and Tools
- [`translate-category-guide.md`](./translate-category-guide.md) - Translate category usage guide
- [`general-assistant-tools-fix.md`](./general-assistant-tools-fix.md) - General Assistant tool access permission fix

## 🏗️ Extension System Architecture

### Registration Mechanism
- **Auto Registration**: Using `auto_register_tool!` and `auto_register_category!` macros
- **Parameterized Registration**: Supporting constructors with parameters
- **Global Registry**: Compile-time collection based on `inventory` crate

### Core Components
- **Tools**: Concrete feature implementations, interface defined through `Tool` trait
- **Categories**: Tool grouping management, interface defined through `Category` trait
- **ToolsManager**: Unified management of tool and category lifecycle

## 🔧 Usage Scenarios

### Tool Development
1. Implement `Tool` trait
2. Add `TOOL_NAME` constant
3. Register using registration macros

### Category Development
1. Implement `Category` trait
2. Add `CATEGORY_ID` constant
3. Declare required tools in `required_tools()`
4. Register using registration macros

### Parameterized Construction
- Use `auto_register_tool_with_constructor!` to pass fixed parameters
- Use `auto_register_tool_advanced!` to support dynamic configuration
- Read parameters from environment variables or configuration files

## 📖 Quick Start

### Creating a Simple Tool
```rust
#[derive(Debug)]
pub struct MyTool;

impl MyTool {
    pub const TOOL_NAME: &'static str = "my_tool";
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for MyTool {
    // Implement necessary methods
}

// Register tool
auto_register_tool!(MyTool);
```

### Creating a Tool with Parameters
```rust
auto_register_tool_advanced!(ConfigurableTool, || {
    let config = load_config();
    Arc::new(ConfigurableTool::new(config.url, config.key))
});
```

## 🎯 Best Practices

1. **Prefer Advanced Macros**: `auto_register_tool_advanced!` provides maximum flexibility
2. **Environment Variable Configuration**: Avoid hardcoding configuration parameters
3. **Error Handling**: Provide reasonable default values in constructors
4. **Documentation**: Clearly explain tool parameters and usage

## 🔗 Related Documentation

- [Architecture Documentation](../architecture/) - System overall architecture design
- [Development Guide](../development/) - Development standards and best practices
- [Configuration Documentation](../configuration/) - System configuration and prompt management
