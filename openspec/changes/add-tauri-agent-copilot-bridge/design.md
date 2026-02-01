# Design: Tauri Agent Autostart + Local OpenAI Forwarder

## Overview

When the app is launched via Tauri, it should:
- Start the agent server automatically via the agent library (no separate process).
- Route agent LLM calls to the local web service’s OpenAI-compatible endpoint
  (`/v1/chat/completions`) to reuse the existing Copilot client/token.
- Persist all agent session data under `~/.bodhi`.
- Provide health heartbeat polling so the UI reflects real availability.

## Architecture

### Agent Startup (Tauri Mode)
- Tauri calls into `copilot_agent_server::run_server_with_config(...)`.
- A `tauri_mode` flag is passed so the agent server:
  - Uses the app data dir for storage.
  - Selects `copilot_bridge` provider by default (unless overridden).
- Server runs on a dedicated port (default `8081`).

### Local OpenAI Forwarder
- Agent uses its existing OpenAI provider but points to the local web service
  (`http://127.0.0.1:8080/v1`) to reuse Tauri’s Copilot authentication.
- No device-code flow in tauri mode.

### Storage and Session Data
- In tauri mode, agent storage root becomes the app data directory (`~/.bodhi`).
- Session data should be stored in a consistent location within that directory
  (e.g., `~/.bodhi/copilot-agent/`).
- Non-tauri mode retains current `~/.copilot-agent` behavior.

### Health Heartbeat and UI Status
- Frontend polls `/api/v1/health` periodically (e.g., 5–10s).
- Status indicator updates live; if unhealthy:
  - Show warning in UI.
  - Fall back to Direct Mode for new messages.

## Configuration

- Agent port: existing default (8081), optionally configurable from Tauri.
- Provider selection:
  - Tauri mode defaults to `openai` with base URL set to the local web service.
  - CLI mode preserves existing `copilot`/`openai` behavior.

## Error Handling

- If agent startup fails in tauri mode:
  - Log error
  - Notify user
  - Continue with Direct Mode

## Open Questions

- Exact storage subdirectory name under `~/.bodhi` (e.g., `copilot-agent/`).
- Heartbeat interval default (5s vs 10s).
