## 1. Analysis (no behavior change)
- [x] 1.1 Confirm no crates depend on `agent_orchestrator` (Cargo metadata + ripgrep).
- [x] 1.2 Identify and list any docs/scripts referencing `agent_orchestrator`.

## 2. Implementation
- [x] 2.1 Remove `crates/agent_orchestrator` from workspace members in `Cargo.toml`.
- [x] 2.2 Delete `crates/agent_orchestrator/`.
- [x] 2.3 Update docs that describe the workspace crate list (remove or replace references).

## 3. Validation
- [x] 3.1 cargo check -p copilot_chat -p web_service -p web_service_standalone
