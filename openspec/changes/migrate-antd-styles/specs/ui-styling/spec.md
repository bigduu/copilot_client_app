## ADDED Requirements
### Requirement: Ant Design component coverage
The UI SHALL use Ant Design components for layout, navigation, forms, and content presentation across Chat, Agent, Debug, and Settings pages when equivalent components exist.

#### Scenario: Primary pages use Ant Design components
- **WHEN** a user opens the Chat, Agent, Debug, or Settings pages
- **THEN** layout containers, lists, inputs, buttons, tabs, and panels are rendered with Ant Design components instead of custom HTML wrappers

### Requirement: Minimal custom CSS
Custom CSS SHALL be limited to layout constraints or behaviors that are not supported by Ant Design components.

#### Scenario: Styling exceptions are scoped
- **WHEN** new styling is added or updated
- **THEN** CSS is only used for scroll behavior, highlight animations, or virtualization constraints and is scoped to the component

### Requirement: Theme consistency via tokens
Colors, spacing, and typography SHALL use Ant Design theme tokens to ensure consistent light and dark mode rendering.

#### Scenario: Dark mode consistency
- **WHEN** dark mode is enabled
- **THEN** colors and surfaces rely on Ant Design tokens without hardcoded overrides except for required CSS exceptions
