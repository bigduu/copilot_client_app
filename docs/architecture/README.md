# Architecture Documentation

This directory contains project architecture design and system enhancement documentation.

## 📋 Core Architecture

### Context & Session Management (v2.0)
- [`CONTEXT_SESSION_ARCHITECTURE.md`](./CONTEXT_SESSION_ARCHITECTURE.md) - **NEW** Complete architecture overview for Context Manager v2.0
- [`context-manager-migration.md`](./context-manager-migration.md) - Migration guide from v1.0 to v2.0
- [`context_manager_fsm_plan.md`](./context_manager_fsm_plan.md) - Finite State Machine design
- [`context_manager_plan.md`](./context_manager_plan.md) - Original planning document

### Frontend Architecture
- [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md) - Frontend system design
- [`AGENT_LOOP_ARCHITECTURE.md`](./AGENT_LOOP_ARCHITECTURE.md) - Agent interaction loop
- [`WORKFLOW_SYSTEM_ARCHITECTURE.md`](./WORKFLOW_SYSTEM_ARCHITECTURE.md) - Workflow system design

### Tool System
- [`tools-system.md`](./tools-system.md) - Tool system developer guide
- [`TOOL_ARCHITECTURE_MIGRATION_GUIDE.md`](./TOOL_ARCHITECTURE_MIGRATION_GUIDE.md) - Tool architecture migration
- [`IMPROVED_TOOL_CALL_FLOW.md`](./IMPROVED_TOOL_CALL_FLOW.md) - Tool call flow improvements

### Enhancement Plans
- [`MERMAID_ENHANCEMENT.md`](./MERMAID_ENHANCEMENT.md) - Mermaid diagram enhancements
- [`SYSTEM_PROMPT_ENHANCEMENT_PLAN.md`](./SYSTEM_PROMPT_ENHANCEMENT_PLAN.md) - System prompt optimization

### Model Integration
- [`copilot_model_refactor_plan.md`](./copilot_model_refactor_plan.md) - Copilot model refactor
- [`openai_adapter_plan.md`](./openai_adapter_plan.md) - OpenAI adapter design

## 📖 Quick Start

### For New Developers
1. Start with [`CONTEXT_SESSION_ARCHITECTURE.md`](./CONTEXT_SESSION_ARCHITECTURE.md) to understand the core system
2. Read [`FRONTEND_ARCHITECTURE.md`](./FRONTEND_ARCHITECTURE.md) for frontend structure
3. Review [`tools-system.md`](./tools-system.md) for tool development

### For Migration
1. Read [`context-manager-migration.md`](./context-manager-migration.md) for migration steps
2. Check [Release Notes](../release/CONTEXT_MANAGER_V2_RELEASE_NOTES.md) for breaking changes
3. Review [API Documentation](../api/CONTEXT_MANAGER_API.md) for new endpoints

## 🏗️ Document Categories

### System Architecture
Documents describing overall system design and component relationships:
- Context & Session Management
- Frontend Architecture
- Agent Loop Architecture

### Feature Enhancements
Documents for specific feature improvements and optimizations:
- Mermaid Enhancement
- System Prompt Enhancement
- Tool Call Flow Improvements

### Migration Guides
Documents for architecture changes and system upgrades:
- Context Manager Migration
- Tool Architecture Migration

## 🔄 Maintenance

Architecture documentation should be updated as the system evolves to ensure consistency with actual implementation.

### Recent Updates
- **2025-11-09**: Added Context Manager v2.0 architecture documentation
- **2025-11-09**: Created comprehensive API documentation
- **2025-11-09**: Published v2.0 release notes

## 📚 Related Documentation

- [API Documentation](../api/) - REST API and SSE event reference
- [Release Notes](../release/) - Version history and changelogs
- [OpenSpec Changes](../../openspec/changes/) - Structured change proposals
- [Development Guides](../development/) - Development workflows and guidelines