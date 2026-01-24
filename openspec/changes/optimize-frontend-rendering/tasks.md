## 1. Implementation

- [ ] 1.1 Identify render hot paths in Chat, Agent, and Settings during streaming
- [ ] 1.2 Add scoped state selectors to avoid page-wide subscriptions
- [ ] 1.3 Memoize stable layout subtrees and callbacks in each page
- [ ] 1.4 Batch streaming UI updates to a bounded cadence
- [ ] 1.5 Verify that non-message UI elements do not re-render during streaming

## 2. Validation

- [ ] 2.1 Use React Profiler to confirm reduced renders in Chat and Agent
- [ ] 2.2 Smoke-test streaming, session switching, and settings navigation
