## Why

Currently, the project has minimal test coverage with only 3 test files across all crates. The `web_service` crate has basic API integration tests, `reqwest-sse` has e2e tests, but major crates like `tool_system`, `context_manager`, `copilot_client`, and `mcp_client` have no tests at all. This creates significant risk for regressions and makes refactoring dangerous. Comprehensive tests are needed to ensure code quality, catch bugs early, and enable confident development.

## What Changes

- **tool_system crate**: Add unit tests for ToolRegistry, ToolExecutor, all tool implementations, and all categories
- **context_manager crate**: Add unit tests for FSM state transitions, ChatContext operations, Branch management, and message handling
- **copilot_client crate**: Add unit tests for authentication, model listing, request/response handling, and SSE streaming
- **mcp_client crate**: Add unit tests for client lifecycle, tool listing, tool execution, and error handling
- **web_service crate**: Expand existing integration tests to cover all controllers, services, error paths, and edge cases
- **reqwest-sse crate**: Add unit tests for SSE parsing, JSON event handling, and error recovery

Each crate will have comprehensive coverage targeting:
- All public APIs and key functions
- Error paths and edge cases
- State transitions and lifecycle management
- Integration between modules
- Mock-based testing for external dependencies

## Impact

- Affected specs: New `testing` capability specification
- Affected code: All crates in the `crates/` directory
- Test files will be added alongside existing code
- No production code changes, only test additions
- CI/CD pipeline may need updates to run comprehensive test suite

