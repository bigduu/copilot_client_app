## Why

Custom HTML/CSS styling is inconsistent across pages and increases maintenance cost. Aligning UI to Ant Design components will improve visual consistency and reduce bespoke CSS.

## What Changes

- Replace custom HTML/CSS with Ant Design components where feasible across Chat, Agent, Settings, and shared UI.
- Keep only necessary CSS for animations or layout constraints that Ant Design cannot cover (e.g., virtualized list positioning, highlight animation).
- Migrate in small, reviewable steps to reduce risk.

## Impact

- Affected specs: ui-styling (new)
- Affected code: ChatView, ChatSidebar, AgentView, AgentSidebar, SystemSettingsPage, shared components with custom CSS
