# skill-system Specification

## ADDED Requirements

### Requirement: Built-in tool references

The system SHALL accept only built-in tool references in `tool_refs` and normalize tool names to their un-namespaced form.

#### Scenario: Reject unsupported tool references

- **WHEN** a skill file includes a tool reference that is not a built-in tool
- **THEN** the system rejects the skill file and logs a validation warning

#### Scenario: Normalize namespaced tool references

- **WHEN** a skill file includes a tool reference like `default::read_file`
- **THEN** the system stores it as `read_file`
