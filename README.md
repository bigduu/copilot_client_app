# Bamboo - GitHub Copilot Chat Desktop

Bamboo is a native desktop application for GitHub Copilot Chat, built with **Tauri** (Rust backend) and **React/TypeScript** (frontend). It provides a focused, AI-assisted coding experience with autonomous agent capabilities and an intuitive chat interface.

## Features

### Core Chat
- **Interactive Chat Interface** - Clean, responsive chat window with real-time streaming
- **Rich Markdown Rendering** - Formatted text, lists, links, and Mermaid diagrams
- **Syntax Highlighting** - Code snippets with accurate language detection
- **Cross-Platform** - Native experience on macOS, Windows, and Linux

### AI Agent System
- **Autonomous Tool Usage** - LLM can invoke tools to accomplish tasks
- **Agent Loop Orchestration** - Backend manages multi-step execution
- **Approval Gates** - Sensitive operations require explicit user approval
- **Error Recovery** - Intelligent retry with LLM feedback
- **Timeout Protection** - Safeguards against runaway loops

### User Workflows
- **Explicit Control** - User-initiated workflows for complex operations
- **Form-Based UI** - Parameter input with validation
- **Category Organization** - Grouped by functionality (general, file operations, system)
- **Safety Warnings** - Clear prompts for destructive operations

### Developer Experience
- **System Prompt Management** - Create and manage custom prompts
- **Context Persistence** - Backend-managed chat history
- **File References** - Drag/drop or `@mention` files
- **Virtualized Rendering** - Smooth performance with large conversations

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Ant Design 5, Vite |
| Backend | Rust, Tauri, Actix-web |
| State | Zustand (UI), custom hooks (chat) |
| Testing | Vitest (frontend), cargo test (backend) |

## Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://rustup.rs/)
- GitHub Copilot API token

### Installation

```bash
# Clone the repository
git clone https://github.com/bigduu/copilot_client_app.git
cd copilot_client_app

# Install dependencies
npm install

# Configure API token
# Create a .token file in src-tauri/ with your GitHub Copilot token
```

### Development

```bash
# Start development server
npm run tauri dev

# Run tests
npm run test

# Format code
npm run format
```

### Build

```bash
# Create production build
npm run tauri build
```

## Project Structure

```
bamboo/
├── src/                    # Frontend React application
│   ├── pages/             # Page components (Chat, Settings, Spotlight)
│   ├── app/               # Root app component
│   └── services/          # Shared services
├── src-tauri/             # Tauri application entry
├── crates/                # Rust crates
│   ├── chat_core/         # Shared types
│   ├── copilot_client/    # Copilot API client
│   ├── web_service/       # HTTP server
│   └── copilot-agent/     # Agent system
└── docs/                  # Documentation
```

## Documentation

Comprehensive documentation is organized in the `docs/` directory:

- **[Architecture](docs/architecture/)** - System design and architecture
- **[Development](docs/development/)** - Development guidelines
- **[Extension System](docs/extension-system/)** - Tool creation and registration
- **[Testing](docs/testing/)** - Testing strategies

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Run `npm run format` before committing
5. Push and open a Pull Request

### Commit Convention

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/config changes

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Note**: Version 2.0+ introduces backend-managed chat context. See the [migration guide](docs/architecture/context-manager-migration.md) if upgrading from earlier versions.
