## Overview
Establish a render-scope strategy that isolates high-frequency streaming updates to the smallest possible subtree. This includes:
- Localizing streaming state to the message list components.
- Preventing layout, sidebars, and page shells from subscribing to fast-changing state.
- Using memoization and selector-based store access to reduce re-render propagation.

## Approach
1. **State scoping**
   - Keep streaming deltas in view-local state or a dedicated store slice with selectors so only message list components subscribe.
   - Avoid passing high-frequency state through top-level layout props.

2. **Selector hygiene**
   - Replace broad store subscriptions with narrow selectors.
   - Use shallow comparison or explicit equality where appropriate to avoid re-renders on unrelated state changes.

3. **Render memoization**
   - Wrap stable subtrees (sidebars, headers, tool panels) with memoization and stable callbacks.

4. **Streaming batching**
   - Batch UI updates for streaming text so re-render cadence is bounded (e.g., via requestAnimationFrame or a short interval).

## Trade-offs
- Extra complexity in component boundaries and state ownership.
- Slight delay in streaming updates if batching is used; keep intervals short to remain responsive.

## Non-goals
- Large UI redesigns or new state libraries.
- Altering backend streaming behavior.
