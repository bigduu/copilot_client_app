# ChatView Scroll Button Group Positioning Design

Date: 2026-02-11

## Context
The ChatView scroll buttons (up/down) are wrapped in a `div` with `position: fixed`, but each Ant Design `FloatButton` is also `position: fixed` by default. Because the button itself is fixed to the viewport, the wrapper’s `bottom` value does not affect its position. This makes changes to the wrapper’s `bottom` appear to have no effect and causes the buttons to remain anchored to Antd’s default inset values.

## Goals
- Make the scroll button positioning respond to ChatView’s `bottom`/`right` values.
- Preserve the existing conditional rendering and scroll behavior.
- Keep spacing between buttons consistent with the current design.

## Proposed Change
Replace the wrapper `div` with `FloatButton.Group` and move the positioning styles to the Group. `FloatButton.Group` is designed to be the fixed-position container, with child buttons laid out statically inside it. Apply `right` and `bottom` based on the existing breakpoint logic (`xs` vs non-`xs`), plus a `gap` that matches the prior layout (`token.marginSM`). This shifts responsibility for positioning to the component that controls layout in Ant Design while keeping the rest of the ChatView behavior unchanged.

## Testing
Add a focused RTL test that renders `ChatView` with mocks for store and hooks, asserts the group element exists, and verifies it receives the expected `bottom` and `right` inline styles for a non-`xs` breakpoint. Run the test via:

```
npm run test:run -- src/pages/ChatPage/components/__tests__/ChatViewScrollButtons.test.tsx
```

## Risks
- The test relies on Antd’s group class name (`.ant-float-btn-group`), which could change in a future Ant Design upgrade. If it does, the test should be updated to query by a more stable selector.
