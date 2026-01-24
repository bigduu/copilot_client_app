## Why

The frontend currently hardcodes the backend API base URL (e.g. `http://127.0.0.1:8080/v1`), which makes it hard to run against a different host/port (LAN server, Docker, remote dev, etc.).

## What Changes

- Add a user-configurable "Backend API Base URL" setting in the frontend (System Settings)
- Persist the setting locally so it survives restarts
- Update all frontend HTTP/OpenAI client calls to use the configured base URL instead of hardcoded constants
- Provide a safe default (env override for dev/build, then fallback to current localhost value)

## Impact

- Affected code: `src/components/SystemSettingsModal`, `src/services/*`, `src/hooks/*` that call the backend via `fetch` / OpenAI client
- Behavior: backend can be switched without rebuilding the frontend; incorrect URL will surface as request failures
