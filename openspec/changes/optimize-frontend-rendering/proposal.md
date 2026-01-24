## Why

Streaming message updates are high-frequency and currently trigger broader UI updates than needed, which degrades responsiveness across pages.

## What Changes

- Introduce a render-scope strategy so only the minimal UI regions update during streaming and other high-frequency state changes.
- Add fine-grained state selectors and memoization to prevent page-wide re-renders in Chat, Agent, and Settings views.
- Add targeted batching/throttling for streaming UI updates to reduce unnecessary render churn.

## Impact

- Affected specs: frontend-performance (new)
- Affected code: ChatView, AgentView, Settings page, shared stores/selectors, streaming update paths
