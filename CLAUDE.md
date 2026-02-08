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

This is **Bodhi**, a GitHub Copilot Chat Desktop application built with Tauri (Rust backend) and React/TypeScript (frontend). The application provides a native desktop interface for interacting with GitHub Copilot's chat API, featuring conversation management, agent-driven tool execution, workflows, and Spotlight search.

## Architecture

### High-Level Structure
- **Frontend**: React 18 + TypeScript + Ant Design 5, built with Vite
- **Backend**: Rust with Tauri framework, organized into modular crates
- **State Management**: Zustand for global UI state, custom hooks for chat state
- **Build System**: Vite (frontend), Cargo (Rust backend)
- **Testing**: Vitest for frontend, `cargo test` for backend

### Rust Crates Architecture

**Core Infrastructure:**
- `chat_core` - Foundational types shared across crates (messages, config, encryption)
- `copilot_client` - GitHub Copilot API client with authentication, streaming, retry logic

**Server Layer:**
- `web_service` - Actix-web HTTP server (port 8080) that forwards requests to Copilot API
- `web_service_standalone` - Standalone web service variant

**Agent System:**
- `copilot-agent/` - Workspace containing agent loop and tool execution
  - `copilot-agent-core` - Agent loop orchestration
  - `copilot-agent-server` - Server-side agent handling
  - `builtin_tools` - Built-in tool implementations

**Application Entry:**
- `src-tauri/` - Main Tauri application integrating all crates, with commands for:
  - Claude Code integration (checkpoints, sessions, projects)
  - Spotlight global shortcut (Cmd+Shift+Space)
  - Proxy authentication dialog
  - File operations

### Frontend Architecture

**Page Structure:**
- `src/app/` - Root App component and MainLayout
- `src/pages/ChatPage/` - Main chat interface with:
  - `hooks/useChatManager/` - Chat state machine and operations
  - `components/` - ChatView, MessageCard, InputContainer, etc.
  - `services/` - API clients, storage, workflow management
  - `store/slices/` - Zustand slices (appSettings, favorites, prompt)
  - `types/` - TypeScript type definitions
- `src/pages/SettingsPage/` - Application settings (includes Claude Installer)
- `src/pages/SpotlightPage/` - Quick search/action interface
- `src/shared/` - Cross-page utilities and components
- `src/services/` - Shared services (common utilities, agent services)

**Key Patterns:**
- Chat state managed through `useChatManager` hook with state machine pattern
- Services in `ChatPage/services/` handle API communication and business logic
- Zustand store in `ChatPage/store/` for persistent UI state

## Development Commands

### Frontend
```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server (port 1420)
npm run build            # Type-check and build for production
npm run test             # Run Vitest in watch mode
npm run test:run         # Run tests once
npm run test:coverage    # Run tests with coverage
npm run format           # Format with Prettier
npm run format:check     # Check formatting without writing
```

### Tauri
```bash
npm run tauri dev        # Start Tauri in development mode
npm run tauri build      # Build desktop application
```

### Rust Backend
```bash
# From project root
cargo build              # Build all crates
cargo test               # Run all Rust tests
cargo check              # Quick type check
cargo fmt                # Format Rust code
cargo clippy             # Lint Rust code

# Single crate
cargo test -p copilot_client
cargo test -p web_service
```

## Key Technical Details

### State Management
- **Chat State**: `useChatManager` hook (`src/pages/ChatPage/hooks/useChatManager/`) manages chat lifecycle
  - `useChatStateMachine.ts` - Simplified state machine (IDLE | THINKING | AWAITING_APPROVAL)
  - `useChatOperations.ts` - Message sending, streaming, cancellation
  - `openAiStreamingRunner.ts` - OpenAI-compatible streaming implementation
- **Global UI State**: Zustand store in `src/pages/ChatPage/store/slices/`

### Backend Communication
- **HTTP API**: Frontend communicates with local web_service on port 8080
- **Tauri Commands**: Native functionality via `invoke()` (file picker, clipboard, etc.)
- **Streaming**: Server-sent events (SSE) for real-time chat responses

### Build Configuration
- **Vite**: Port 1420 with HMR, manual chunking for vendor libraries (React, Ant Design, Mermaid, PDF)
- **Tauri**: macOS private API enabled, global shortcut plugin for Spotlight

### Testing
- **Frontend**: Vitest with jsdom, tests in `src/**/__tests__/` directories
- **Backend**: Standard Rust tests, wiremock for HTTP mocking in `copilot_client`

## Important Dependencies

### Crate Relationships
- `web_service` → depends on `copilot_client`, `copilot-agent-server`, `skill_manager`
- `src-tauri` → integrates `copilot_client`, `web_service`, `copilot-agent-server`
- `copilot_client` → uses `chat_core` for types

### Key Frontend Libraries
- `@tanstack/react-virtual` - Virtual scrolling for message lists
- `@xstate/react` - State machines (legacy, being phased out)
- `zustand` - Global state management
- `html2canvas` + `jspdf` - PDF export functionality
- `mermaid` - Diagram rendering in messages
