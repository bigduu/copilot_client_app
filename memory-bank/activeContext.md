# Active Context: Copilot Chat

## Current Work Focus

### Active Development Areas
1. Chat Experience
   - Enhanced chat sidebar with favorites and improved navigation
   - Streaming message display and performance optimization
   - System message and prompt modal improvements
   - Search window UI and backend integration

2. Authentication & Models
   - Refined AuthContext and authentication flow
   - Copilot API integration and session management
   - Persistent model selection (global default for new chats via `useModels` and `localStorage`)

3. Core Features
   - Search and filtering across conversations
   - System prompt configuration and templates
   - Chat management (creation, deletion, organization)
   - Message handling and streaming

### Recent Changes
1. Frontend
   - Major refactor of chat sidebar and navigation (FavoritesPanel, ChatSidebar)
   - Improved streaming message components and performance
   - System prompt modal and settings enhancements
   - Search window UI and logic overhaul
   - Persistent model selection via enhanced `useModels` hook and `localStorage`
   - Modularization of components and hooks

2. Backend
   - Refined Copilot client integration and modularization
   - Improved authentication and session handling
   - Enhanced message channel and streaming logic
   - IPC communication and error handling improvements

## Active Decisions & Considerations

### Architecture Decisions
1. State Management
   - React Context for global state (ChatContext, AuthContext)
   - Custom hooks for model management and chat logic
   - Immutable state updates and reducer patterns

2. UI/UX Decisions
   - Ant Design for UI (migration to Shadcn/Tailwind under consideration)
   - CSS modules for scoped styling
   - Responsive, accessible layout
   - Window management via Tauri

### Technical Considerations
1. Performance
   - Streaming message efficiency
   - Search speed and scalability
   - State update optimization
   - Window and resource management

2. Security
   - Secure authentication and session persistence
   - API key and sensitive data handling
   - IPC and data persistence security

## Current Patterns & Preferences

### Development Patterns
1. Component Structure
   - Functional components with TypeScript
   - Modular, reusable UI components
   - CSS modules for styling
   - Context consumers and custom hooks

2. State Management
   - Context-based global state
   - Custom hooks for abstraction
   - Immutable updates and reducer patterns

### Code Organization
1. Frontend
   - Feature-based component organization
   - Shared utilities and type definitions
   - Modular hooks and context providers

2. Backend
   - Modular Rust code (copilot, mcp, processor)
   - Clear separation of concerns
   - Async/await and robust error handling

## Recent Learning & Insights

### Technical Insights
1. Performance
   - Streaming optimization and resource management
   - Efficient state and context updates
   - Window and IPC handling strategies

2. Architecture
   - Context-driven state management
   - Modular frontend and backend design
   - Error propagation and handling

### Implementation Learnings
1. Frontend
   - Advanced React context and hooks patterns
   - TypeScript type safety and code organization
   - UI modularization and optimization
   - Persistent preferences with `localStorage`

2. Backend
   - Tauri IPC and Rust async patterns
   - Modular API client and authentication logic
   - Streaming and error handling improvements

## Next Steps & Priorities

### Immediate Tasks
1. UI/UX
   - Finalize search and filtering features
   - Polish streaming message UI and performance
   - Refine system prompt and settings modals
   - Enhance chat navigation and favorites

2. Backend
   - Strengthen error handling and logging
   - Optimize API and streaming performance
   - Improve authentication/session flow
   - Implement robust message persistence

### Future Considerations
1. Features
   - Advanced search and message organization
   - System prompt templates and user preferences
   - Theme customization and accessibility
   - Migration to Shadcn UI/Tailwind for UI modernization

2. Technical Debt
   - Comprehensive documentation
   - Automated test coverage
   - Error and performance monitoring
   - Refactoring for maintainability

## Active Challenges

### Technical Challenges
1. Performance
   - Streaming and search optimization
   - Efficient state and context updates
   - Window and resource management

2. Integration
   - Complex authentication and API flows
   - IPC and backend communication
   - Persistent, secure data storage

### Development Focus
1. Short-term
   - Bug fixes and feature completion
   - UI/UX polish and performance
   - Backend stability and error handling

2. Long-term
   - Scalability and maintainability
   - Feature expansion and modernization
   - Technical debt reduction
