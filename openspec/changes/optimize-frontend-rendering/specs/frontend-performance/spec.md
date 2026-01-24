## ADDED Requirements

### Requirement: Render-scope isolation

The system SHALL isolate high-frequency streaming updates to the message list region so unrelated page areas do not re-render.

#### Scenario: Streaming updates in Chat

- **WHEN** streaming tokens are appended to the current chat
- **THEN** only the chat message list updates and sidebars/layout chrome remain stable

#### Scenario: Streaming updates in Agent

- **WHEN** streaming output is appended in the Agent view
- **THEN** only the agent message list updates and non-message UI remains stable

### Requirement: Selector-based state access

The system SHALL use narrow state selectors to prevent unrelated updates from triggering page-wide renders.

#### Scenario: Updating model selection

- **WHEN** the selected model changes
- **THEN** only components that depend on the model selection re-render

### Requirement: Bounded streaming cadence

The system SHALL batch or throttle streaming UI updates to reduce excessive render frequency.

#### Scenario: High-frequency streaming burst

- **WHEN** a rapid stream of tokens arrives
- **THEN** UI updates are applied at a bounded cadence without freezing the page
