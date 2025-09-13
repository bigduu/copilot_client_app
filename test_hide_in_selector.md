# Hide in Selector Feature Implementation

## Feature Overview

I have successfully implemented the `hide_in_selector` feature, which allows certain tools to be called only by the AI, without appearing in the user's tool selector.

## Implemented Changes

### 1. Tool Trait Extension
- Added the `hide_in_selector()` method in `src-tauri/src/extension_system/types/tool.rs`
- It returns `false` by default, meaning tools are visible in the selector by default

### 2. ToolConfig Struct Update
- Added the `hide_in_selector: bool` field to `ToolConfig`
- Updated the related construction logic

### 3. Frontend Interface Update
- Updated the Rust `ToolUIInfo` struct
- Updated the TypeScript `ToolUIInfo` interface
- Updated the interface definition for the ToolSelector component

### 4. Filtering Logic Implementation
- Modified the `get_tools_for_ui` command to filter out tools where `hide_in_selector` is `true`
- This filtering is applied in both strict and non-strict modes

### 5. Example Implementation
- Implemented `hide_in_selector() -> true` in `BitbucketTool`
- Implemented `hide_in_selector() -> true` in `ConfluenceTool`

## Feature Characteristics

1. **AI Callable**: Hidden tools can still be called by the AI in non-strict mode
2. **User Invisible**: Hidden tools will not appear in the ToolSelector component's list
3. **Backward Compatible**: By default, all tools are visible (`hide_in_selector` defaults to `false`)
4. **Flexible Configuration**: Each tool can independently decide whether to be hidden

## How to Use

To hide a tool from the selector, simply override the `hide_in_selector` method in the tool's implementation:

```rust
fn hide_in_selector(&self) -> bool {
    true // Hide this tool
}
```

## Testing Suggestions

1. Start the application
2. Open the tool selector (triggered by typing `/`)
3. Verify that the `bitbucket` and `confluence` tools are not in the list
4. Verify through AI conversation that these tools can still be called

## Notes

- Hidden tools will still appear in tool documentation and other APIs
- They are only filtered out when the user is actively selecting a tool
- The AI can still call these tools in the appropriate context
