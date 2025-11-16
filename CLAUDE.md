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
The backend is organized into specialized crates:
- `copilot_client`: GitHub Copilot API client and authentication
- `web_service`: Actix-web HTTP server for API endpoints
- `context_manager`: Conversation context and message management
- `session_manager`: User session handling and persistence
- `tool_system`: Tool execution and approval workflows
- `workflow_system`: Complex workflow orchestration
- `mcp_client`: Model Context Protocol client integration

### Frontend Architecture
- `src/core/`: Core business logic including StateManager and chat interaction machines
- `src/store/`: Zustand stores for different application domains (chat, models, settings, etc.)
- `src/services/`: Service layer for API communication and data operations
- `src/components/`: Reusable UI components organized by feature
- `src/contexts/`: React context providers for dependency injection
- `src/types/`: TypeScript type definitions

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
- **StateManager**: Centralized chat state management with transaction support (`src/core/StateManager.ts`)
- **Zustand Stores**: Domain-specific stores for models, settings, chat sessions (`src/store/`)
- **XState Machines**: Complex interaction flows using `@xstate/react` (`src/core/chatInteractionMachine.ts`)

### Service Architecture
- **Factory Pattern**: ServiceFactory manages service instantiation and lifecycle
- **Backend Abstraction**: Services work with both local Rust backend and external HTTP backends
- **Context Providers**: Dependency injection through React contexts (`src/contexts/`)

### Component Patterns
- **Compound Components**: Complex UI components like InputContainer with multiple sub-components
- **Approval Workflows**: Multi-step approval system for tool execution and agent actions
- **Message Types**: Specialized components for different message types (System, Tool, Question, etc.)

### Error Handling
- **Centralized Error Management**: ErrorHandler in `src/core/ErrorHandler.ts`
- **Graceful Degradation**: Fallback UI states when services are unavailable
- **Transaction Rollback**: StateManager supports transactional operations with rollback

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

## Migration and Legacy

### Recent Changes
- Migration from localStorage to backend-based context management
- Transition to unified state management with StateManager
- Updated API structure for better separation of concerns
- Enhanced tool system with approval workflows

### Legacy Code
- Some migration code is commented out but preserved for reference
- Legacy LocalStorage cleanup utilities are available but disabled
- Historical data migration is currently disabled per user request