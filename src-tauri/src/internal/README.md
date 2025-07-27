# Internal Company Module

This module contains all company-specific tools, categories, and services that are only available in the company environment.

## Overview

The internal module is designed to be completely separate from the external codebase, allowing for easy synchronization between external development and company internal environments.

## Architecture

```
src-tauri/src/internal/
├── mod.rs              # Main module with InternalModule trait
├── tools/              # Company-specific tools
│   ├── mod.rs
│   ├── bitbucket.rs    # Bitbucket API access
│   └── confluence.rs   # Confluence documentation access
├── categories/         # Tool categories for internal tools
│   ├── mod.rs
│   └── company_tools.rs # Company tools category
└── services/           # Internal services (proxy, auth, etc.)
    ├── mod.rs
    ├── proxy.rs        # Company proxy configuration
    └── auth.rs         # Authentication service
```

## Usage

### External Environment (Default)

```bash
# Build without internal features
cargo build

# Run without internal features
cargo run
```

In this mode:
- No internal tools or categories are available
- No company-specific services are loaded
- The application runs with only public tools

### Company Internal Environment

```bash
# Build with internal features
cargo build --features internal

# Run with internal features
cargo run --features internal
```

In this mode:
- All internal tools and categories are available
- Company-specific services are loaded (proxy, auth, etc.)
- Users can access Bitbucket, Confluence, and other internal systems

## Adding New Internal Tools

1. **Create the tool** in `src-tauri/src/internal/tools/`:

```rust
// src-tauri/src/internal/tools/my_tool.rs
use async_trait::async_trait;
use crate::tools::{Tool, ToolType, ToolExecutionContext, ToolResult};
use crate::auto_register_tool;

#[derive(Debug)]
pub struct MyTool;

impl MyTool {
    pub const TOOL_NAME: &'static str = "my_tool";
    pub fn new() -> Self { Self }
}

#[async_trait]
impl Tool for MyTool {
    fn name(&self) -> String { Self::TOOL_NAME.to_string() }
    fn description(&self) -> String { "My company tool".to_string() }
    // ... implement other methods
}

// Auto-register when internal feature is enabled
#[cfg(feature = "internal")]
auto_register_tool!(MyTool);
```

2. **Add to tools module** in `src-tauri/src/internal/tools/mod.rs`:

```rust
pub mod my_tool;
pub use my_tool::MyTool;
```

3. **Register with category** in `src-tauri/src/internal/categories/company_tools.rs`:

```rust
fn required_tools(&self) -> &'static [&'static str] {
    &[
        BitbucketTool::TOOL_NAME,
        ConfluenceTool::TOOL_NAME,
        MyTool::TOOL_NAME, // Add your tool here
    ]
}
```

## Adding New Internal Categories

1. **Create the category** in `src-tauri/src/internal/categories/`:

```rust
// src-tauri/src/internal/categories/my_category.rs
use crate::tools::{Category, CategoryId};
use crate::auto_register_category;

#[derive(Debug)]
pub struct MyCategoryCategory;

impl MyCategoryCategory {
    pub const CATEGORY_ID: &'static str = "my_category";
    pub fn new() -> Self { Self }
}

impl Category for MyCategoryCategory {
    fn id(&self) -> String { Self::CATEGORY_ID.to_string() }
    // ... implement other methods
}

#[cfg(feature = "internal")]
auto_register_category!(MyCategoryCategory);
```

2. **Add to CategoryId enum** in `src-tauri/src/tools/tool_types.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum CategoryId {
    // ... existing categories
    #[cfg(feature = "internal")]
    MyCategory,
}
```

## Adding Internal Services

1. **Create the service** in `src-tauri/src/internal/services/`:

```rust
// src-tauri/src/internal/services/my_service.rs
pub struct MyService {
    // service fields
}

impl MyService {
    pub fn new() -> Self { Self { /* ... */ } }
    // service methods
}
```

2. **Register in setup function** in `src-tauri/src/internal/services/mod.rs`:

```rust
pub fn setup_company_services_sync<R: Runtime>(app: &mut App<R>) -> Result<(), Box<dyn std::error::Error>> {
    // ... existing setup
    
    // Add your service
    let my_service = MyService::new();
    app.manage(my_service);
    
    Ok(())
}
```

## Code Synchronization Workflow

### From External to Company

1. **Frontend**: Direct copy
   ```bash
   # In company environment
   rm -rf src/
   cp -r /path/to/external/src/ ./src/
   ```

2. **Backend**: Selective copy
   ```bash
   # In company environment
   # Copy everything except internal/
   rsync -av --exclude='internal/' /path/to/external/src-tauri/src/ ./src-tauri/src/
   
   # Keep internal/ directory intact
   # Your internal/ directory remains unchanged
   ```

### From Company to External

1. **Frontend**: Direct copy (excluding any company-specific files)
   ```bash
   # In external environment
   cp -r /path/to/company/src/ ./src/
   ```

2. **Backend**: Selective copy
   ```bash
   # In external environment
   # Copy everything except internal/
   rsync -av --exclude='internal/' /path/to/company/src-tauri/src/ ./src-tauri/src/
   ```

## Environment Configuration

### Company Environment Variables

```bash
# Proxy settings
export HTTP_PROXY=http://proxy.company.com:8080
export HTTPS_PROXY=https://proxy.company.com:8080
export NO_PROXY=localhost,127.0.0.1,.company.com

# Authentication
export BITBUCKET_BASE_URL=https://bitbucket.company.com
export CONFLUENCE_BASE_URL=https://confluence.company.com
export AUTH_ENDPOINT=https://auth.company.com/oauth/token
export CLIENT_ID=copilot-chat-client
```

### Build Configuration

Add to company's `Cargo.toml`:

```toml
[features]
default = ["internal"]  # Enable internal by default in company
internal = []
```

Add to external `Cargo.toml`:

```toml
[features]
default = []  # Disable internal by default externally
internal = []
```

## Security Considerations

1. **Feature Flag Protection**: All internal code is protected by `#[cfg(feature = "internal")]`
2. **No Hardcoded Secrets**: Use environment variables for all sensitive configuration
3. **Conditional Compilation**: Internal code is completely excluded from external builds
4. **Service Isolation**: Internal services are managed separately from public services

## Troubleshooting

### Internal Tools Not Available

1. Check that you're building with the internal feature:
   ```bash
   cargo build --features internal
   ```

2. Verify environment variables are set correctly

3. Check logs for initialization errors:
   ```bash
   # Look for these log messages
   "Company internal services initialized"
   "Internal module 'company_internal' initialized successfully"
   ```

### Build Errors

1. **Missing CategoryId**: Add new categories to the CategoryId enum with proper feature flags
2. **Tool Registration**: Ensure tools are properly registered with `auto_register_tool!`
3. **Feature Flag Mismatch**: Ensure all internal code uses `#[cfg(feature = "internal")]`
