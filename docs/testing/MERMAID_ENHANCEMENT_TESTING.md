# Mermaid Enhancement Feature Testing Guide

This document describes how to test the Mermaid Enhancement feature end-to-end.

## Overview

The Mermaid Enhancement feature allows users to enable/disable Mermaid diagram generation guidelines in the system prompt. When enabled, the AI assistant will be encouraged to create visual diagrams using Mermaid syntax.

## Architecture

### Backend Components

1. **ChatConfig** (`crates/context_manager/src/structs/context.rs`)
   - Added `mermaid_diagrams: bool` field (default: `true`)

2. **PromptEnhancer Trait** (`crates/context_manager/src/pipeline/enhancers/mod.rs`)
   - Interface for system prompt enhancement plugins

3. **MermaidEnhancementEnhancer** (`crates/context_manager/src/pipeline/enhancers/mermaid_enhancement.rs`)
   - Implements `PromptEnhancer`
   - Priority: 50
   - Adds Mermaid diagram guidelines when `config.mermaid_diagrams == true`

4. **SystemPromptProcessor** (`crates/context_manager/src/pipeline/processors/system_prompt.rs`)
   - Manages internal enhancer pipeline
   - Runs enhancers in priority order (high to low)
   - Default enhancers:
     - RoleContextEnhancer (priority 90)
     - ToolEnhancementEnhancer (priority 60)
     - MermaidEnhancementEnhancer (priority 50)
     - ContextHintsEnhancer (priority 40)

5. **API Endpoint** (`crates/web_service/src/controllers/context_controller.rs`)
   - `PATCH /contexts/{id}/config` - Update configuration
   - `GET /contexts/{id}/metadata` - Get lightweight metadata (includes `mermaid_diagrams`)
   - `GET /contexts/{id}` - Get full context (includes `config.mermaid_diagrams`)

## Unit Tests

### Context Manager Tests

Run all context_manager tests:
```bash
cargo test --package context_manager
```

Run only Mermaid enhancement tests:
```bash
cargo test --package context_manager --test mermaid_enhancement_tests
```

### Test Coverage

The `mermaid_enhancement_tests.rs` file includes:

1. **test_mermaid_enhancer_enabled**
   - Verifies enhancer returns fragment when `mermaid_diagrams = true`
   - Checks fragment priority is 50
   - Validates fragment contains Mermaid-related content

2. **test_mermaid_enhancer_disabled**
   - Verifies enhancer returns `None` when `mermaid_diagrams = false`

3. **test_system_prompt_processor_with_mermaid_enabled**
   - Tests full SystemPromptProcessor with Mermaid enabled
   - Verifies final system prompt contains Mermaid guidelines

4. **test_system_prompt_processor_with_mermaid_disabled**
   - Tests full SystemPromptProcessor with Mermaid disabled
   - Verifies final system prompt does NOT contain Mermaid guidelines

5. **test_chat_config_mermaid_default**
   - Verifies default value is `true`

6. **test_chat_config_serialization**
   - Tests JSON serialization/deserialization with `mermaid_diagrams = true`

7. **test_chat_config_serialization_disabled**
   - Tests JSON serialization/deserialization with `mermaid_diagrams = false`

8. **test_enhancer_priority_order**
   - Verifies all enhancers run in correct priority order
   - Checks final prompt contains contributions from all enhancers

9. **test_custom_enhancer_registration**
   - Tests manual enhancer registration
   - Verifies custom enhancer pipeline works correctly

10. **test_mermaid_enhancer_name**
    - Verifies enhancer name is "mermaid_enhancement"

## Manual API Testing

### Prerequisites

1. Start the backend server:
```bash
cargo run
```

2. Create a new context:
```bash
curl -X POST http://localhost:8080/api/contexts \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "gpt-4",
    "mode": "default"
  }'
```

Save the returned `id` for subsequent requests.

### Test 1: Check Default Value

Get context metadata:
```bash
curl http://localhost:8080/api/contexts/{context_id}/metadata
```

Expected response should include:
```json
{
  "id": "...",
  "mermaid_diagrams": true,
  ...
}
```

### Test 2: Disable Mermaid Enhancement

Update configuration:
```bash
curl -X PATCH http://localhost:8080/api/contexts/{context_id}/config \
  -H "Content-Type: application/json" \
  -d '{
    "mermaid_diagrams": false
  }'
```

Expected response:
```json
{
  "message": "Context configuration updated successfully"
}
```

### Test 3: Verify Update

Get metadata again:
```bash
curl http://localhost:8080/api/contexts/{context_id}/metadata
```

Expected response should include:
```json
{
  "id": "...",
  "mermaid_diagrams": false,
  ...
}
```

### Test 4: Enable Mermaid Enhancement

Update configuration:
```bash
curl -X PATCH http://localhost:8080/api/contexts/{context_id}/config \
  -H "Content-Type: application/json" \
  -d '{
    "mermaid_diagrams": true
  }'
```

### Test 5: Update Multiple Fields

Update both `auto_generate_title` and `mermaid_diagrams`:
```bash
curl -X PATCH http://localhost:8080/api/contexts/{context_id}/config \
  -H "Content-Type: application/json" \
  -d '{
    "auto_generate_title": false,
    "mermaid_diagrams": false
  }'
```

## Frontend Integration Testing

### Prerequisites

1. Backend server running
2. Frontend development server running:
```bash
npm run dev
```

### Test Scenarios

#### Scenario 1: Toggle Mermaid Enhancement in Settings

1. Open the application
2. Create a new chat context
3. Open System Settings Modal
4. Find "Mermaid Diagrams Enhancement" toggle
5. Toggle OFF
6. Verify:
   - Backend receives PATCH request to `/contexts/{id}/config` with `mermaid_diagrams: false`
   - Context metadata updates
7. Toggle ON
8. Verify:
   - Backend receives PATCH request with `mermaid_diagrams: true`
   - Context metadata updates

#### Scenario 2: Verify System Prompt Changes

1. Enable Mermaid Enhancement
2. Send a message asking for a diagram (e.g., "Show me a flowchart of user authentication")
3. Check System Message Card - Enhanced Prompt should contain Mermaid guidelines
4. Disable Mermaid Enhancement
5. Send another message
6. Check System Message Card - Enhanced Prompt should NOT contain Mermaid guidelines

#### Scenario 3: Context Persistence

1. Create a new context with Mermaid enabled
2. Send some messages
3. Disable Mermaid Enhancement
4. Refresh the page
5. Verify:
   - Context loads correctly
   - Mermaid setting is still disabled
   - Previous messages are intact

## Expected Behavior

### When Mermaid Enhancement is ENABLED

- System prompt includes guidelines like:
  - "When appropriate, use Mermaid diagrams to visualize concepts"
  - "Supported diagram types: flowchart, sequence, class, state, etc."
  - Instructions on how to format Mermaid code blocks

### When Mermaid Enhancement is DISABLED

- System prompt does NOT include Mermaid-related guidelines
- AI assistant will not be specifically encouraged to create diagrams
- User can still request diagrams manually, but AI won't proactively suggest them

## Troubleshooting

### Issue: Mermaid setting not persisting

**Possible causes:**
- Context not being saved to disk
- Frontend not calling the correct API endpoint

**Solution:**
- Check backend logs for save errors
- Verify PATCH request is being sent correctly
- Check that `ctx.mark_dirty()` is called after updating config

### Issue: System prompt not updating

**Possible causes:**
- SystemPromptProcessor not running
- Enhancer not registered
- Frontend caching old system prompt

**Solution:**
- Check that `with_default_enhancers()` is being used
- Verify enhancer is in the enhancers list
- Clear frontend cache and refresh

### Issue: Tests failing

**Possible causes:**
- API changes
- Metadata key mismatch
- Incorrect test expectations

**Solution:**
- Check that metadata key is `"final_system_prompt"` not `"system_prompt"`
- Verify enhancer name is `"mermaid_enhancement"` (lowercase with underscore)
- Update test expectations to match actual behavior

## Performance Considerations

- Enhancer execution is lightweight (< 1ms per enhancer)
- No impact on message processing latency
- System prompt is assembled once per message, not per chunk
- Metadata updates trigger auto-save (async, non-blocking)

## Security Considerations

- No user input is directly injected into system prompt
- Mermaid guidelines are static, predefined text
- No risk of prompt injection through this feature
- Configuration updates require valid context ID (UUID)

## Future Enhancements

Potential improvements:
1. Custom Mermaid templates per user
2. Diagram type preferences (e.g., only flowcharts)
3. Complexity level settings (simple vs. detailed diagrams)
4. Integration with diagram rendering service
5. Diagram history and favorites

