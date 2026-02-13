# Copilot Client Auth and Proxy Auth Flow

This document explains how the Copilot client is initialized, how auth works,
and how proxy auth is applied at runtime.

## Global Copilot client

- A single process-wide Copilot client is created via `OnceLock` in
  `crates/web_service/src/server.rs`.
- Both `web_service::server::run` and `WebService::start` call the same
  `build_server_state`, which reuses the global client.
- If the server is started with a different `app_data_dir` after the global
  client is initialized, a warning is logged and the existing client is reused.

## Init flow (Tauri -> web service -> Copilot client)

1. `src-tauri/src/lib.rs` resolves the app data directory (`~/.bamboo`) and
   spawns the web service with `web_service::server::run`.
2. `crates/web_service/src/server.rs` builds app state and initializes the
   global Copilot client:
   - `Config::new()` loads config from `~/.bamboo/config.json` (or `config.toml`)
     and environment variables, then clears any proxy auth fields.
   - `CopilotClient::new(config, app_data_dir)` constructs a shared `reqwest`
     client, `CopilotAuthHandler`, and `CopilotModelsHandler`.
3. The Copilot client stores its token files under `app_data_dir`:
   - `.token` (GitHub access token)
   - `.copilot_token.json` (Copilot token + metadata)

## Copilot auth flow

`CopilotAuthHandler::get_chat_token()` uses this order:

1. Read `.copilot_token.json` and return the token if it is still valid.
2. If `.token` exists, treat it as a GitHub access token and exchange it for a
   Copilot token. If that exchange fails, delete `.token`.
3. Start the device-code flow:
   - If `headless_auth` is true, print the verification URL and user code.
   - Otherwise, open the browser and copy the user code to the clipboard.
4. Poll GitHub for the device authorization access token, write it to `.token`,
   exchange it for a Copilot token, and cache `.copilot_token.json`.

## Proxy auth flow

Proxy auth is applied at runtime only and is not written to `config.json`.

Frontend:
- `SystemSettingsProxyAuthCard` writes credentials to browser `localStorage`
  under `bamboo_proxy_auth`.
- `useSystemSettingsProxyAuth` pushes the current values to
  `POST /v1/bamboo/proxy-auth` on load, on save/clear, and every 10 seconds.

Backend:
- `POST /v1/bamboo/proxy-auth` calls `CopilotClient::update_proxy_auth`.
- `update_proxy_auth` updates the in-memory config, rebuilds the `reqwest`
  client with proxy credentials, and refreshes the auth/models handlers.

