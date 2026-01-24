## 1. Discovery / Acceptance Criteria

- [x] 1.1 Backend MUST remain forwarding-only and keep only:
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `POST /v1/messages`
  - `POST /v1/complete`
- [x] 1.2 Tools/approvals/workflows/sessions/contexts/agent-loop endpoints MUST be fully removed
      server-side (not deferred).

## 2. Analysis (no behavior change)

- [x] 2.1 Inventory all `web_service` + `src-tauri` code paths that depend on `session_manager`,
      `chat_state`, `context_manager`, `tool_system`.
- [x] 2.2 Confirm no other crates depend on these four crates (Cargo metadata / cargo tree).
- [x] 2.3 Identify docs/scripts referencing the four crates and list the files to update.

## 3. Implementation (behavior change)

- [x] 3.1 Remove `web_service` modules/controllers/routes that require the removed crates; keep only
      forwarding controllers required by 1.1.
- [x] 3.2 Remove the four crates from `Cargo.toml` workspace members and delete their directories.
- [x] 3.3 Update `Cargo.lock` and any remaining workspace manifests as needed.
- [x] 3.4 Update docs (`AGENTS.md`, `CLAUDE.md`, `README.md` if applicable) to reflect the new crate
      layout and backend responsibilities.

## 4. Validation

- [x] 4.1 `cargo check -p copilot_chat -p web_service -p web_service_standalone`
- [x] 4.2 Run relevant tests that remain after route removals (at least `cargo test -p web_service`)
