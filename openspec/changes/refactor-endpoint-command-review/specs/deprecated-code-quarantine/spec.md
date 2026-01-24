## ADDED Requirements

### Requirement: Deprecated code quarantine

Deprecated or unused code SHALL be moved into `src/deprecated` (frontend) or `crates/deprecated` (backend) and removed from active imports and builds.

#### Scenario: Dead code path identified

- **WHEN** a module is identified as deprecated or unused
- **THEN** it is moved into the quarantine directory and no longer referenced by active code

### Requirement: Quarantine index

Quarantined code SHALL have a brief index that records origin and reason for deprecation.

#### Scenario: Review deprecated module

- **WHEN** a developer reviews quarantined code
- **THEN** the index provides the origin and reason for deprecation
