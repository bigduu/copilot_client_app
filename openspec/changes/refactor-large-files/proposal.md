## Why

Large modules (300+ lines) slow down reviews, increase merge conflicts, and make it harder to reason about UI and service flows. Refactoring them into smaller units improves maintainability without changing behavior.

## What Changes

- Refactor all source files over 300 lines by extracting cohesive subcomponents, hooks, and helpers.
- Keep exported APIs stable and preserve runtime behavior.
- Allow small improvements (naming, memoization, minor cleanup) when they reduce complexity without altering behavior.
- Keep extracted modules co-located under the same feature folders.

## Impact

- Affected specs: code-organization (new capability for maintainability constraints).
- Affected code: large React components, hooks, and services across `src/components/`, `src/hooks/`, `src/services/`, and `src/types/`.
