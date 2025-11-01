## 1. Setup and Infrastructure

- [x] 1.1 Add dev-dependencies to tool_system/Cargo.toml (mockall, tempfile, tokio-test)
- [x] 1.2 Add dev-dependencies to context_manager/Cargo.toml (mockall, tempfile, tokio-test)
- [x] 1.3 Add dev-dependencies to mcp_client/Cargo.toml (mockall, tokio-test)
- [x] 1.4 Add dev-dependencies to copilot_client/Cargo.toml (wiremock, tokio-test, mockall)
- [x] 1.5 Verify all crates can build with new dev-dependencies

## 2. tool_system Crate Tests

- [x] 2.1 Create tests/registry_tests.rs for ToolRegistry
  - [x] 2.1.1 Test tool registration and retrieval
  - [x] 2.1.2 Test list_tool_definitions
  - [x] 2.1.3 Test concurrent access to registry
  - [x] 2.1.4 Test error handling for unknown tools
- [x] 2.2 Create tests/executor_tests.rs for ToolExecutor
  - [x] 2.2.1 Test successful tool execution
  - [x] 2.2.2 Test execution failure handling
  - [x] 2.2.3 Test concurrent executions
- [x] 2.3 Create tests/tool_tests.rs for individual tools
  - [x] 2.3.1 Test file operation tools (read, create, update, delete, append)
  - [x] 2.3.2 Test command execution tools
  - [x] 2.3.3 Test search tools
  - [x] 2.3.4 Test error handling for each tool
- [ ] 2.4 Create tests/category_tests.rs for category functionality (deferred - basic tests cover main functionality)
  - [ ] 2.4.1 Test category registration
  - [ ] 2.4.2 Test tool assignment to categories
  - [ ] 2.4.3 Test category-based tool filtering
- [ ] 2.5 Create tests/registry_macro_tests.rs for macro behavior (deferred - registration tested via integration)
  - [ ] 2.5.1 Test auto_register_tool macro
  - [ ] 2.5.2 Test parameterized tool registration
  - [ ] 2.5.3 Verify compile-time registration
- [x] 2.6 Run cargo test for tool_system and verify all tests pass (16 tests passing)

## 3. context_manager Crate Tests

- [x] 3.1 Create tests/fsm_tests.rs for state machine
  - [x] 3.1.1 Test all valid state transitions
  - [x] 3.1.2 Test invalid state transitions are ignored
  - [x] 3.1.3 Test transient failure retry logic
  - [x] 3.1.4 Test fatal error handling
- [x] 3.2 Create tests/context_tests.rs for ChatContext
  - [x] 3.2.1 Test context creation and initialization
  - [x] 3.2.2 Test configuration management
  - [x] 3.2.3 Test context cloning
- [x] 3.3 Create tests/branch_tests.rs for branch management
  - [x] 3.3.1 Test branch creation
  - [x] 3.3.2 Test branch switching (tested via context.get_active_branch)
  - [x] 3.3.3 Test message isolation across branches
  - [ ] 3.3.4 Test branch metadata (deferred - basic structure tested)
- [x] 3.4 Create tests/message_tests.rs for message operations
  - [x] 3.4.1 Test adding messages to pool
  - [x] 3.4.2 Test retrieving messages by ID
  - [ ] 3.4.3 Test message queries (deferred - basic retrieval tested)
  - [x] 3.4.4 Test message relationships (via parent_id)
  - [x] 3.4.5 Test message metadata
- [x] 3.5 Create tests/serialization_tests.rs for persistence
  - [x] 3.5.1 Test JSON serialization
  - [x] 3.5.2 Test JSON deserialization
  - [x] 3.5.3 Test round-trip serialization
  - [ ] 3.5.4 Test backward compatibility (deferred)
- [x] 3.6 Run cargo test for context_manager and verify all tests pass (37 tests passing)

## 4. copilot_client Crate Tests

- [ ] 4.1 Create tests/auth_tests.rs for authentication (deferred - requires complex mocking)
  - [ ] 4.1.1 Test successful authentication flow
  - [ ] 4.1.2 Test authentication failure handling
  - [ ] 4.1.3 Test token caching
  - [ ] 4.1.4 Test token refresh
- [ ] 4.2 Create tests/models_tests.rs for model management
  - [ ] 4.2.1 Test model listing
  - [ ] 4.2.2 Test model caching
  - [ ] 4.2.3 Test cache invalidation
- [ ] 4.3 Create tests/request_tests.rs for API requests
  - [ ] 4.3.1 Test non-streaming chat completion
  - [ ] 4.3.2 Test streaming chat completion
  - [ ] 4.3.3 Test request validation
  - [ ] 4.3.4 Test error handling for network failures
- [ ] 4.4 Create tests/sse_tests.rs for SSE processing
  - [ ] 4.4.1 Test chunk parsing
  - [ ] 4.4.2 Test stream consumption
  - [ ] 4.4.3 Test malformed data handling
  - [ ] 4.4.4 Test stream completion
- [ ] 4.5 Create tests/client_tests.rs for client lifecycle
  - [ ] 4.5.1 Test client initialization
  - [ ] 4.5.2 Test configuration handling
  - [ ] 4.5.3 Test proxy configuration
- [ ] 4.6 Run cargo test for copilot_client and verify all tests pass

## 5. mcp_client Crate Tests

- [ ] 5.1 Create tests/client_tests.rs for McpClient (deferred - requires child process setup)
  - [ ] 5.1.1 Test client initialization success
  - [ ] 5.1.2 Test client initialization failure
  - [ ] 5.1.3 Test status tracking
  - [ ] 5.1.4 Test client shutdown
- [ ] 5.2 Create tests/tools_tests.rs for tool operations
  - [ ] 5.2.1 Test tool listing
  - [ ] 5.2.2 Test tool execution success
  - [ ] 5.2.3 Test tool execution failure
  - [ ] 5.2.4 Test tool parameter validation
- [ ] 5.3 Create tests/manager_tests.rs for McpClientManager
  - [ ] 5.3.1 Test manager initialization
  - [ ] 5.3.2 Test adding clients
  - [ ] 5.3.3 Test retrieving clients
  - [ ] 5.3.4 Test tool indexing
  - [ ] 5.3.5 Test client status queries
- [ ] 5.4 Create tests/config_tests.rs for configuration
  - [ ] 5.4.1 Test server config parsing
  - [ ] 5.4.2 Test environment variable handling
  - [ ] 5.4.3 Test timeout configuration
- [ ] 5.5 Run cargo test for mcp_client and verify all tests pass

## 6. web_service Crate Tests

- [ ] 6.1 Expand existing tests/fsm_integration_tests.rs (already exists, has good coverage)
  - [ ] 6.1.1 Add tests for all state transitions
  - [ ] 6.1.2 Add tests for error recovery
  - [ ] 6.1.3 Add tests for concurrent sessions
- [ ] 6.2 Expand existing tests/openai_api_tests.rs
  - [ ] 6.2.1 Add tests for all endpoint variations
  - [ ] 6.2.2 Add tests for edge cases
  - [ ] 6.2.3 Add tests for error paths
- [ ] 6.3 Create tests/controller_tests.rs for controllers
  - [ ] 6.3.1 Test chat_controller endpoints
  - [ ] 6.3.2 Test tool_controller endpoints
  - [ ] 6.3.3 Test system_controller endpoints
  - [ ] 6.3.4 Test openai_controller endpoints
  - [ ] 6.3.5 Test request validation
  - [ ] 6.3.6 Test error responses
- [ ] 6.4 Create tests/service_tests.rs for services
  - [ ] 6.4.1 Test ChatService operations
  - [ ] 6.4.2 Test SessionManager operations
  - [ ] 6.4.3 Test ToolService operations
- [ ] 6.5 Create tests/storage_tests.rs for persistence
  - [ ] 6.5.1 Test session persistence
  - [ ] 6.5.2 Test context loading
  - [ ] 6.5.3 Test storage cleanup
- [ ] 6.6 Run cargo test for web_service and verify all tests pass

## 7. reqwest-sse Crate Tests

- [ ] 7.1 Expand existing tests/e2e.rs (already exists with good coverage - 3 tests passing)
  - [ ] 7.1.1 Add more test cases for event parsing
  - [ ] 7.1.2 Add tests for various event types
  - [ ] 7.1.3 Add tests for retry handling
- [ ] 7.2 Create tests/event_tests.rs for event parsing
  - [ ] 7.2.1 Test simple event parsing
  - [ ] 7.2.2 Test multi-line data
  - [ ] 7.2.3 Test event type handling
  - [ ] 7.2.4 Test empty fields
- [ ] 7.3 Create tests/json_tests.rs for JSON handling
  - [ ] 7.3.1 Test JSON deserialization
  - [ ] 7.3.2 Test JSON error handling
  - [ ] 7.3.3 Test type safety
- [ ] 7.4 Create tests/error_tests.rs for error handling
  - [ ] 7.4.1 Test malformed SSE handling
  - [ ] 7.4.2 Test incomplete streams
  - [ ] 7.4.3 Test error recovery
- [ ] 7.5 Run cargo test for reqwest-sse and verify all tests pass

## 8. Integration and Validation

- [x] 8.1 Run cargo test --all to ensure all crates pass (60+ tests passing)
- [ ] 8.2 Verify test coverage targets are met (aim for 80%+) (deferred - needs coverage tools)
- [ ] 8.3 Add test coverage reporting to CI if not present (deferred)
- [ ] 8.4 Document test execution in README or docs/testing/
- [x] 8.5 Validate no regressions introduced

## 9. Documentation

- [ ] 9.1 Update docs/testing/README.md with new test coverage
- [ ] 9.2 Document test patterns and conventions used (deferred)
- [ ] 9.3 Add examples of how to run specific test suites (deferred)
- [ ] 9.4 Document mock setup for external dependencies (deferred)

