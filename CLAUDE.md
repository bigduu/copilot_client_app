<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Copilot Chat Desktop application built with Tauri (Rust backend) and React/TypeScript (frontend). The application provides a native desktop interface for interacting with GitHub Copilot's chat API, featuring advanced conversation management, tool integration, and workflow capabilities.

## Architecture

### High-Level Structure
- **Frontend**: React 18 + TypeScript + Ant Design UI components
- **Backend**: Rust with Tauri framework, organized into modular crates
- **State Management**: Zustand for frontend state, custom StateManager for chat state
- **Build System**: Vite for frontend, Cargo for Rust backend
- **Testing**: Vitest for frontend, Rust's built-in testing for backend

### Rust Crates Architecture
The workspace consists of 11 specialized crates with clear dependency hierarchy:

**Core Infrastructure:**
- `chat_core` - Foundational types and traits (MessageContent, TodoItem, AgentRole, ContextTree)
- `chat_state` - State machine implementation for chat lifecycle management
- `storage_manager` - File-based storage abstraction layer

**Agent & Context:**
- `agent_orchestrator` - Agent execution loops and todo management (AgentLoop, TodoManager)
- `context_manager` - Conversation context, message management, and pipeline processing
- `session_manager` - User session handling and persistence with multi-user support

**Client & API Layer:**
- `copilot_client` - GitHub Copilot API client with authentication and streaming support
- `web_service` - Actix-web HTTP server with API endpoints and SSE streaming
- `web_service_standalone` - Standalone web service variant
- `mcp_client` - Model Context Protocol client integration

**Feature Systems:**
- `tool_system` - Tool execution, approval workflows, and auto-registration system
- `workflow_system` - Complex workflow orchestration with parameterized workflows

**Application Entry:**
- `src-tauri` - Main Tauri application integrating all crates

### Frontend Architecture
- `src/core/`: StateManager (transactional state), chatInteractionMachine.ts (XState), ErrorHandler, ApprovalManager
- `src/store/`: Zustand stores with 5 slices (chat, models, prompts, favorites, settings)
- `src/services/`: ServiceFactory pattern, TauriService (native commands), HttpServices (API), domain services (Tool, AgentApproval, Workflow, Session)
- `src/components/`: 40+ reusable components (ChatView, MessageCard, ApprovalModal, ToolResultCard, FileReferenceSelector, SystemPromptManager, MCPServerManagement, TodoListDisplay)
- `src/contexts/`: BackendContextProvider, ChatControllerContext
- `src/hooks/`: Custom React hooks (10+)
- `src/types/`: TypeScript definitions (chat.ts, unified-chat.ts, toolConfig.ts, mcp.ts, sse.ts)

## Development Commands

### Frontend Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Type checking
tsc --noEmit

# Testing
npm run test              # Run tests
npm run test:ui          # Run tests with UI
npm run test:coverage    # Run tests with coverage
npm run test:run         # Run tests once

# Code formatting
npm run format           # Format code
npm run format:check     # Check formatting
```

### Tauri Development
```bash
# Start Tauri development mode
npm run tauri dev

# Build desktop application
npm run tauri build

# Run specific Tauri commands
npm run tauri [command]
```

### Rust Backend Development
```bash
# From project root (for workspace-level operations)
cargo build              # Build all crates
cargo test               # Run all tests
cargo check              # Quick type checking
cargo fmt               # Format Rust code
cargo clippy            # Lint Rust code

# For specific crates
cd crates/copilot_client && cargo build
cd crates/web_service && cargo test
```

## Key Technical Patterns

### State Management
- **StateManager** (`src/core/StateManager.ts`): Centralized chat state with transaction support and automatic rollback
- **Zustand Stores**: Domain-specific slices in `src/store/slices/` for chat, models, prompts, favorites, settings
- **XState Machines**: Complex interaction flows using `@xstate/react` in `src/core/chatInteractionMachine.ts`

### Service Architecture
- **Factory Pattern** (`src/services/ServiceFactory.ts`): Service instantiation and lifecycle management
- **Backend Abstraction**: Services work with both local Rust backend (TauriService) and external HTTP backends (HttpServices)
- **Composite Services**: UtilityService combines native Tauri functions with HTTP-based functions
- **Dependency Injection**: React contexts provide services to components

### Component Patterns
- **Compound Components**: Complex UI like InputContainer with multiple sub-components
- **Approval Workflows**: Multi-step approval system for tool execution and agent actions (ApprovalModal, AgentApprovalModal)
- **Specialized Message Types**: SystemMessageCard, ToolResultCard, QuestionMessageCard, PlanMessageCard

### Rust Patterns
- **Auto Registration**: Tool/workflow registries use `inventory` crate for compile-time registration
- **Trait-Based Abstractions**: CopilotClientTrait, ToolRuntime traits for extensibility
- **Message Pipeline**: context_manager uses pipeline pattern with enhancers and processors
- **SSE Streaming**: Signal-pull pattern for server-sent events with streaming support

### Error Handling
- **Centralized Error Management**: ErrorHandler in `src/core/ErrorHandler.ts`
- **Transaction Rollback**: StateManager supports automatic rollback on failed operations
- **Graceful Degradation**: Fallback UI states when services are unavailable

## Testing Strategy

### Frontend Testing
- Unit tests in `src/utils/__tests__/`
- Component testing with React Testing Library
- Integration tests for service layer
- Test setup and helpers in `src/test/`

### Backend Testing
- Unit tests for each Rust crate
- Integration tests in `crates/web_service/tests/`
- Mock servers using wiremock for API testing
- Custom test harnesses for specific workflows

## Configuration Files

### Key Configuration
- `src-tauri/tauri.conf.json`: Tauri application configuration
- `vite.config.ts`: Vite build configuration with Tauri integration
- `package.json`: Frontend dependencies and scripts
- `src-tauri/Cargo.toml`: Rust workspace and dependencies

### Environment Setup
- Frontend runs on port 1420 (configured in vite.config.ts)
- Development server requires fixed port for Tauri integration
- HMR (Hot Module Replacement) configured for development

## Development Notes

### Code Organization
- Follow the established crate structure for new Rust functionality
- Use TypeScript strict mode and proper typing throughout
- Components should be self-contained with clear props interfaces
- Services should abstract backend communication details

### Performance Considerations
- Profiler is enabled in development mode to identify expensive renders
- Virtual scrolling for long message lists using `@tanstack/react-virtual`
- Lazy loading and code splitting for large components
- Efficient state updates through proper memoization

### Security Practices
- API keys and sensitive data handled through Rust backend
- Content Security Policy configured appropriately
- Input sanitization for markdown rendering
- Proper validation of user inputs in tool parameters

## Important Crate Dependencies

Understanding crate dependencies is crucial for modifications:
- `web_service` depends on: context_manager, session_manager, tool_system, workflow_system, mcp_client, copilot_client
- `agent_orchestrator` depends on: chat_core, chat_state, tool_system, workflow_system, copilot_client, mcp_client
- `src-tauri` integrates: copilot_client, web_service, tool_system, mcp_client
- `context_manager` is the central data layer used by most services

## Migration and Legacy

### Recent Refactoring
- Migration from localStorage to backend-based context management
- Transition to unified state management with StateManager
- Introduction of `chat_core` and `chat_state` crates for better separation
- Enhanced tool system with approval workflows and SSE broadcasting

### Legacy Code
- Some migration code is commented out but preserved for reference
- Legacy LocalStorage cleanup utilities are available but disabled per user request