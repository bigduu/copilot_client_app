## Why

Today the agent server runs on a separate port and the app keeps a Direct Mode
fallback path. When the app is launched via Tauri, we already run a local web
service that exposes an OpenAI-compatible `/v1/chat/completions` endpoint and
uses the app’s Copilot client/token. Binding the agent endpoints into the same
web backend removes duplicate auth flows, eliminates the extra port, and makes
Agent Mode the only chat path.

## What Changes

- Mount the agent server **endpoints inside the web backend** (same port as the
  Tauri web service) using the agent server library.
- In tauri mode, the agent uses the local web service’s OpenAI-compatible
  `/v1/chat/completions` endpoint instead of its own Copilot auth.
- Store agent session data under the app data directory (`~/.bodhi`) in tauri mode.
- Remove Direct Mode in the UI; chat requests always go through the agent.
- Keep health heartbeat polling to surface availability, but no Direct Mode fallback.

## Impact

- Affected code:
  - Web service bootstrap: `crates/web_service/src/server.rs`
  - Agent server config: `crates/copilot-agent/crates/copilot-agent-server/src/*`
  - Tauri bootstrap: `src-tauri/src/lib.rs`
  - Frontend agent-only flow: `src/pages/ChatPage/hooks/useChatManager/useChatStreaming.ts`
- Behavior:
- Tauri launch starts the web backend, which hosts agent `/api/v1` endpoints
  on the same port (default 8080).
- Copilot authentication is handled by the existing client; agent no longer
  prompts for device code in tauri mode.
- Direct Mode is removed; chat always uses the agent endpoints.
