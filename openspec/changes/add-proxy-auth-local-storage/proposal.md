## Why

Proxy auth credentials should not be persisted to disk. Today they are stored in the Bodhi config JSON and masked in the UI, which still writes secrets to `~/.bodhi/config.json`. We need to keep username/password in frontend local storage only and push them to the backend at runtime.

## What Changes

- Add a dedicated Proxy Auth form in System Settings (Config tab) that stores username/password in browser local storage only.
- Frontend periodically pushes proxy auth credentials to the backend runtime.
- Backend accepts proxy auth updates and applies them to the runtime Copilot client without writing secrets to disk.
- `/bodhi/config` read/write strips `http_proxy_auth` and `https_proxy_auth` so secrets are never persisted.

## Impact

- Affected specs: backend-config
- Affected code: `crates/web_service`, `crates/chat_core`, `crates/copilot_client`, `src/pages/SettingsPage`, `src/pages/AgentPage/services`
