## ADDED Requirements
### Requirement: State scope boundaries
Frontend state SHALL be scoped to the smallest responsible owner; ephemeral UI state stays local, while shared state is lifted into store slices or shared contexts.

#### Scenario: Shared state across components
- **WHEN** multiple components require the same state
- **THEN** the state is managed in a shared store slice or context

### Requirement: Logic separation
Large UI components SHALL delegate business logic to hooks or services and remain focused on rendering and orchestration.

#### Scenario: Complex interaction flow
- **WHEN** a component requires multi-step backend interactions
- **THEN** the interaction logic is extracted into a hook or service
