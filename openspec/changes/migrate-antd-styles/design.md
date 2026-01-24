## Context

The UI currently mixes Ant Design components with custom HTML/CSS, leading to visual inconsistency and duplicated styling logic. The request is to review all pages and replace custom styling with Ant Design components, step by step.

## Goals / Non-Goals

- Goals:
  - Align Chat, Agent, Debug, and Settings pages to Ant Design components and tokens.
  - Minimize custom CSS to only cases Ant Design cannot cover.
  - Preserve existing behaviors and layout constraints (streaming, scrolling, virtualization).
- Non-Goals:
  - Redesign information architecture or change data flows.
  - Introduce new UI patterns unrelated to Ant Design adoption.

## Decisions

- Use Ant Design Layout, Flex, Card, List, Typography, Tabs, and form components to replace custom wrappers.
- Keep custom CSS only for scroll behavior, highlight animations, and layout constraints that Ant Design cannot provide.
- Use Ant Design theme tokens for color, spacing, and typography to ensure dark/light consistency.

## CSS Exceptions (Current)

- ChatView: scroll hiding, input stickiness, highlight animation, and virtualization sizing.
- App root: global reset and layout sizing.

## Risks / Trade-offs

- Risk: Large refactors may introduce regressions in scroll or streaming performance.
  - Mitigation: Migrate page-by-page with minimal diffs and verify behavior after each step.
- Risk: Some custom styling may be necessary for specialized layouts.
  - Mitigation: Document exceptions in CSS and keep them scoped to the component.

## Migration Plan

1. Inventory pages and existing CSS usage.
2. Migrate Chat page, then Agent page, then Debug/Settings and shared components.
3. Remove unused CSS and verify dark/light mode consistency.

## Open Questions

- None.
