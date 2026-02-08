# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New agent system with autonomous tool execution and approval gates
- Spotlight search functionality (Cmd+Shift+Space) for quick actions
- Comprehensive documentation reorganization and cleanup

### Changed
- Migrated from legacy copilot_client to new agent-based architecture
- Refactored web_service and src-tauri to use new agent system
- Unified configuration directory paths using `chat_core::paths`
- Translated all documentation from Chinese to English

### Removed
- Deprecated `copilot_client` crate (replaced by agent system)
- Deprecated `skill_manager` crate (functionality merged into agent system)
- Deprecated `copilot-agent` legacy crates
- Legacy AgentPage and frontend agent components
- OpenSpec system and related files
- Checkpoint module and Claude Code integration
- 40+ temporary implementation and bug-fix reports (moved to CHANGELOG)

### Fixed
- Async loop handling in agent engine
- Windows command execution for Claude (`cmd /C`)
- Environment variable propagation for local base URL
- TodoList SSE reconnection loop causing "Stream started" log spam every 5 seconds
- QuestionDialog aggressive polling reduced with adaptive intervals and auto-stop

## [0.2.0] - 2025-11-05

### Added
- Chat memory that restores the most recent conversation across sessions and devices
- AI-assisted chat title generation with user preference controls and inline status feedback
- System prompt selector improvements: Markdown preview, syntax highlighting, and copy support
- Enhanced tool & workflow result cards with collapsible formatting and execution metadata
- Drag-and-drop / paste support for multiple file types plus `@` file reference selector
- Virtualised chat message list powered by `@tanstack/react-virtual` for smoother scrolling
- Plan-Act agent architecture for complex multi-step tasks
- Context Manager v2: Backend-managed chat context with persistence
- Dual-mode architecture: LLM-driven tools and user-invoked workflows
- Built-in tools: filesystem operations, search, command execution
- Mermaid diagram rendering in chat messages
- PDF export functionality for conversations

### Changed
- Refactored message transformation utilities to share backend DTO conversion logic
- Streamlined message input props into a dedicated interaction contract
- Added development-only React Profiler instrumentation for MainLayout renders
- Introduced Prettier formatting scripts and applied consistent styling across the repo
- Migrated chat context from browser LocalStorage to backend storage

### Fixed
- Addressed inconsistencies in system prompt display when switching prompts mid-chat
- Resolved various TypeScript typing issues surfaced during UI/UX refactor

### Security
- Secure proxy authentication storage with encryption
- Backend proxy auth dialog with "remember me" and "skip" options
- Removed frontend proxy auth UI to prevent credential exposure

## [0.1.0] - 2025-08-01

### Added
- Initial release of Bodhi - GitHub Copilot Chat Desktop
- React 18 + TypeScript frontend with Ant Design 5
- Tauri + Rust backend architecture
- Basic chat interface with streaming responses
- Syntax highlighting for code blocks
- System prompt management
- Cross-platform support (macOS, Windows, Linux)

[Unreleased]: https://github.com/bigduu/copilot_client_app/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bigduu/copilot_client_app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/bigduu/copilot_client_app/releases/tag/v0.1.0
