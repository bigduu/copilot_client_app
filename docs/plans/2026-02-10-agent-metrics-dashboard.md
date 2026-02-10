# Bodhi Agent Metrics Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add end-to-end persistent metrics collection and visualization for token usage, tool calls, and session statistics.

**Architecture:** Introduce a new `agent-metrics` crate with a SQLite-backed metrics store and async collector channel, wire it into `agent-loop` and `agent-server`, expose query endpoints under `/api/v1/metrics`, and render a new Settings Metrics tab in the React frontend via reusable service/hook/components.

**Tech Stack:** Rust (`rusqlite`, `tokio`, `chrono`, `uuid`), Actix Web, React + TypeScript + Ant Design + Recharts.

---

### Task 1: Add failing backend tests for metrics crate behavior

**Files:**
- Create: `crates/agent-metrics/src/types.rs`
- Create: `crates/agent-metrics/src/storage.rs`
- Create: `crates/agent-metrics/src/collector.rs`
- Create: `crates/agent-metrics/src/aggregator.rs`
- Create: `crates/agent-metrics/src/lib.rs`

**Step 1: Write failing tests for SQLite storage queries and aggregation**
- Add tests for summary, model breakdown, session listing/detail, and daily aggregation.

**Step 2: Run targeted tests to verify RED state**
- Run: `cargo test -p agent-metrics`
- Expected: compile/test failures due missing implementations.

### Task 2: Implement `agent-metrics` crate

**Files:**
- Create: `crates/agent-metrics/Cargo.toml`
- Modify: `Cargo.toml`

**Step 1: Implement types and status enums**
- Define round/session/tool/daily models and API DTOs.

**Step 2: Implement SQLite schema + storage trait**
- Add initialization/migrations and query methods.

**Step 3: Implement collector and aggregator**
- Add async event ingestion and retention cleanup hooks.

**Step 4: Run tests to verify GREEN state**
- Run: `cargo test -p agent-metrics`

### Task 3: Integrate collector in `agent-loop`

**Files:**
- Modify: `crates/agent-loop/src/config.rs`
- Modify: `crates/agent-loop/src/runner.rs`
- Modify: `crates/agent-loop/Cargo.toml`

**Step 1: Write/adjust failing loop integration tests**
- Ensure collector receives round/tool lifecycle updates.

**Step 2: Implement non-blocking collector calls**
- Hook round start/completion/error/cancel and tool start/end.

**Step 3: Run loop tests**
- Run: `cargo test -p agent-loop`

### Task 4: Add metrics service + HTTP controllers in `agent-server`

**Files:**
- Create: `crates/agent-server/src/handlers/metrics.rs`
- Modify: `crates/agent-server/src/handlers/mod.rs`
- Modify: `crates/agent-server/src/state.rs`
- Modify: `crates/agent-server/src/handlers/stream.rs`
- Modify: `crates/agent-server/src/server.rs`
- Modify: `crates/web_service/src/server.rs`
- Modify: `crates/agent-server/Cargo.toml`

**Step 1: Add failing handler tests for endpoint shapes**
- Validate response schema for summary/by-model/sessions/detail/daily.

**Step 2: Implement metrics state wiring and routes**
- Initialize metrics DB under app data dir and inject into stream loop config.

**Step 3: Implement controller query parsing and responses**
- Handle optional date filters and pagination-safe ordering.

**Step 4: Run server tests**
- Run: `cargo test -p agent-server`

### Task 5: Build frontend metrics dashboard

**Files:**
- Create: `src/services/metrics/MetricsService.ts`
- Create: `src/services/metrics/types.ts`
- Create: `src/services/metrics/index.ts`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/hooks/useMetrics.ts`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/metrics/MetricCards.tsx`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/metrics/TokenChart.tsx`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/metrics/ModelDistribution.tsx`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/metrics/SessionTable.tsx`
- Create: `src/pages/SettingsPage/components/SystemSettingsPage/SystemSettingsMetricsTab.tsx`
- Modify: `src/pages/SettingsPage/components/SystemSettingsPage/index.tsx`
- Modify: `src/services/index.ts`
- Modify: `package.json`

**Step 1: Add failing hook/service/component tests (minimal smoke coverage)**
- Add tests for service normalization and hook refresh behavior.

**Step 2: Implement service + hook + tab UI**
- Render cards, charts, session table, and session detail modal.

**Step 3: Run frontend tests/build**
- Run: `npm run test:run -- src/pages/SettingsPage/components/SystemSettingsPage`
- Run: `npm run build`

### Task 6: Final verification

**Step 1: Full backend verification**
- Run: `cargo test -p agent-metrics -p agent-loop -p agent-server`

**Step 2: Full frontend verification**
- Run: `npm run test:run -- src/pages/SettingsPage/components/SystemSettingsPage`
- Run: `npm run build`

**Step 3: Manual requirement checklist verification**
- Confirm all required metrics and endpoints/components are implemented.
