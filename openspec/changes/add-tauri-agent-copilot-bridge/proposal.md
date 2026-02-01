## Why

Today the agent server performs its own authentication and must be started
separately. When the app is launched via Tauri, we already run a local web
service that exposes an OpenAI-compatible `/v1/chat/completions` endpoint and
uses the app’s Copilot client/token. Auto-starting the agent from Tauri and
pointing it at that local endpoint removes duplicate auth flows and setup.

## What Changes

- Start the agent server **from Tauri** (in-process via the agent server library),
  passing a **tauri mode** flag, the app data directory, and the port.
- In tauri mode, the agent uses the local web service’s OpenAI-compatible
  `/v1/chat/completions` endpoint instead of its own Copilot auth.
- Store agent session data under the app data directory (`~/.bodhi`) in tauri mode.
- Add **health heartbeat** polling and explicit UI status + fallback when the
  agent becomes unavailable.

## Impact

- Affected code:
  - Tauri bootstrap: `src-tauri/src/lib.rs`
  - Agent server config: `crates/copilot-agent/crates/copilot-agent-server/src/*`
  - Agent startup/config: `crates/copilot-agent/crates/copilot-agent-server/src/*`
  - Frontend agent status: `src/pages/ChatPage/hooks/useChatManager/useChatStreaming.ts`
- Behavior:
  - Tauri launch auto-starts agent server on the configured port.
  - Copilot authentication is handled by the existing client; agent no longer
    prompts for device code in tauri mode.
