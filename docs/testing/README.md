# Testing Documentation

This directory contains testing-related documentation for the project, covering testing strategies, guides, and best practices.

## 📋 Current Testing Status

### Test Coverage Overview
- **tool_system**: 16 tests passing (registry, executor, tools)
- **context_manager**: 37 tests passing (FSM, context, branches, messages, serialization)
- **web_service**: 3 existing integration tests passing
- **reqwest-sse**: 3 existing e2e tests passing
- **Total**: 60 tests passing

### Extension System Tests
- **Tool Registration**: All tools correctly registered via `auto_register_tool!` macro
- **Category Configuration**: General Assistant and Translate categories running normally
- **Tool Access**: General Assistant can access all 8 tools
- **Translation Functionality**: Translate category provides pure translation services

### New Test Suites
- **Registry Tests**: Test tool registration, retrieval, concurrent access
- **Executor Tests**: Test tool execution, error handling, concurrent execution
- **Tool Tests**: Test file operations, command execution, error handling
- **FSM Tests**: Test all state transitions, retry logic, error handling
- **Context Tests**: Test context creation, configuration, cloning
- **Branch Tests**: Test branch management, message isolation
- **Message Tests**: Test message operations, relationships, metadata
- **Serialization Tests**: Test JSON serialization/deserialization

## 🧪 Testing Strategy

### Unit Tests
- **Tool Tests**: Functional tests for each tool
- **Category Tests**: Category configuration and tool access tests
- **Registration Tests**: Auto-registration mechanism tests

### Integration Tests
- **End-to-End Tests**: Complete user interaction flow tests
- **API Tests**: Frontend-backend interface tests
- **Tool Call Tests**: Tool invocation flow tests

## 📖 Testing Guide

### Running Tests
```bash
# Run all tests
cargo test

# Run tests for all crates
cargo test --all

# Run tests for specific crate
cargo test -p tool_system
cargo test -p context_manager

# Run specific test file
cargo test --test registry_tests
cargo test --test fsm_tests

# Run integration tests
cargo test --test integration
```

### Test Coverage
- Target coverage: 80%+
- Critical modules: 100% coverage
- Generate coverage reports regularly

## 🔧 Testing Tools

- **Rust Testing Framework**: Built-in test framework
- **Mock Tools**: For simulating external dependencies
- **Integration Tests**: Tauri testing tools

These tests ensure system stability and reliability, providing assurance for continuous integration and deployment.

## 🧪 Documentation Categories

- **Testing Specifications**: Test categorization, standards, and best practices
- **Test Reports**: Execution results and analysis of specific tests
- **Refactoring Tests**: Test validation documentation after code refactoring

## 🔄 Maintenance

Testing documentation should be updated in sync with code changes to ensure test case validity and result accuracy. When adding features or fixing issues, corresponding testing documentation should be added promptly.

## 📊 Test Coverage

It is recommended to regularly review testing documentation to ensure:
- Test cases cover core functionality
- Test results accurately reflect system status
- Testing documentation has consistent format and complete content