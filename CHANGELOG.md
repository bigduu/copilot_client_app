# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-11-05

### Added
- Chat memory that restores the most recent conversation across sessions and devices.
- AI-assisted chat title generation with user preference controls and inline status feedback.
- System prompt selector improvements: Markdown preview, syntax highlighting, and copy support.
- Enhanced tool & workflow result cards with collapsible formatting and execution metadata.
- Drag-and-drop / paste support for multiple file types plus `@` file reference selector.
- Virtualised chat message list powered by `@tanstack/react-virtual` for smoother scrolling.

### Changed
- Refactored message transformation utilities to share backend DTO conversion logic.
- Streamlined message input props into a dedicated interaction contract.
- Added development-only React Profiler instrumentation for MainLayout renders.
- Introduced Prettier formatting scripts and applied consistent styling across the repo.

### Fixed
- Addressed inconsistencies in system prompt display when switching prompts mid-chat.
- Resolved various TypeScript typing issues surfaced during UI/UX refactor.

---

