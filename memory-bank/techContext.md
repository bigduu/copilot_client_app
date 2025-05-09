# Technical Context: Copilot Chat

## Development Environment

### Frontend Stack
1. Core Technologies
   - React 18+
   - TypeScript 5+
   - Vite as build tool
   - Ant Design component library
   - CSS Modules for styling

2. Key Dependencies
   - @tauri-apps/api for Tauri integration
   - React Context for state management
   - TypeScript for type safety
   - Ant Design for UI components

3. Development Tools
   - Vite dev server
   - TypeScript compiler
   - ESLint for linting
   - Prettier for formatting

### Backend Stack
1. Core Technologies
   - Rust
   - Tauri 2.0
   - tokio for async runtime
   - serde for serialization

2. Key Dependencies
   - tauri-build for building
   - reqwest for HTTP client
   - serde for JSON handling
   - tokio for async operations

3. Development Tools
   - Rust toolchain
   - Cargo package manager
   - Tauri CLI
   - clippy for linting

## Project Structure

### Frontend Organization
```
src/
├── components/         # React components
│   ├── ChatItem/      # Chat list items
│   ├── ChatSidebar/   # Navigation sidebar
│   ├── ChatView/      # Main chat interface
│   ├── SearchWindow/  # Search functionality
│   └── ...
├── contexts/          # React contexts
│   ├── AuthContext    # Authentication state
│   └── ChatContext   # Chat management
├── hooks/             # Custom React hooks
├── layouts/           # Page layouts
├── types/            # TypeScript definitions
└── utils/            # Utility functions
```

### Backend Organization
```
src-tauri/
├── src/
│   ├── main.rs        # Application entry
│   ├── lib.rs         # Core library
│   └── copilot/       # Copilot integration
│       ├── client.rs  # API client
│       ├── config.rs  # Configuration
│       ├── model.rs   # Data models
│       └── auth/      # Authentication
└── Cargo.toml         # Rust dependencies
```

## Development Workflow

1. Local Development
   - Frontend dev server (Vite)
   - Tauri development build
   - Hot module replacement
   - TypeScript watch mode

2. Building
   - Vite production build
   - Tauri binary compilation
   - Resource bundling
   - Platform-specific packaging

3. Testing
   - Frontend unit tests
   - Backend integration tests
   - E2E testing capability
   - Manual testing procedures

## Technical Constraints

1. Cross-Platform Requirements
   - Windows compatibility
   - macOS compatibility
   - Linux compatibility
   - Native OS integration

2. Performance Requirements
   - Fast startup time
   - Efficient message handling
   - Minimal memory usage
   - Smooth animations

3. Security Requirements
   - Secure authentication
   - API key protection
   - Safe IPC communication
   - Data encryption

## Configuration Management

1. Frontend Configuration
   - Vite configuration
   - TypeScript configuration
   - Environment variables
   - Build settings

2. Backend Configuration
   - Tauri configuration
   - Rust compilation settings
   - Development capabilities
   - Release profiles

3. Development Tools
   - Editor configuration
   - Linting rules
   - Format settings
   - Git ignore rules

## Dependency Management

1. Frontend Dependencies
   - npm/yarn for packages
   - Package versioning
   - Development tools
   - Type definitions

2. Backend Dependencies
   - Cargo for Rust packages
   - Crate versioning
   - Platform-specific deps
   - Build dependencies

## Build and Deploy

1. Build Process
   - Frontend compilation
   - Backend compilation
   - Resource bundling
   - Binary packaging

2. Release Process
   - Version management
   - Changelog updates
   - Binary distribution
   - Update mechanisms
