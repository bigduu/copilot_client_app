## ADDED Requirements

### Requirement: Separated Storage Architecture

The storage system SHALL separate context metadata from message content, enabling efficient partial loading and updates.

#### Scenario: Context metadata storage structure

- **GIVEN** a chat context needs to be persisted
- **WHEN** saving the context
- **THEN** a metadata.json file SHALL be created containing:
  - Context ID, parent_id
  - Configuration (model_id, mode, agent_role, etc.)
  - Branch definitions (names, system prompts)
  - Active branch name
  - Current state
- **AND** the metadata SHALL NOT include message content
- **AND** the metadata file SHALL be small (<100KB typically)

#### Scenario: Message content storage structure

- **GIVEN** messages need to be persisted
- **WHEN** saving messages
- **THEN** each message SHALL be stored in a separate file
- **AND** messages SHALL be organized by branch: `messages/branch-{name}/{message_id}.json`
- **AND** the file SHALL contain the full InternalMessage structure
- **AND** message files SHALL be named by their UUID

#### Scenario: Message index structure

- **GIVEN** a context has messages stored separately
- **WHEN** creating the message index
- **THEN** an index.json file SHALL be created containing:
  - Mapping of message_id to file path
  - Message metadata (timestamp, role, type, size)
  - Branch membership information
- **AND** the index SHALL enable fast message lookup
- **AND** the index SHALL be updated incrementally

### Requirement: Incremental Message Loading

The storage system SHALL support loading messages on-demand rather than loading the entire history at once.

#### Scenario: Loading context without messages

- **GIVEN** a context is being loaded
- **WHEN** load_context is called with load_messages=false
- **THEN** only metadata.json SHALL be read
- **AND** the context structure SHALL be created
- **AND** branch.message_ids SHALL be populated from the index
- **AND** message_pool SHALL be empty initially
- **AND** loading SHALL be fast (<50ms for typical context)

#### Scenario: Loading specific messages

- **GIVEN** a context is loaded without messages
- **WHEN** messages for a specific branch are requested
- **THEN** only the message files for that branch SHALL be read
- **AND** messages SHALL be loaded into message_pool
- **AND** message_ids in the branch SHALL remain consistent
- **AND** other branches' messages SHALL remain unloaded

#### Scenario: Loading message range

- **GIVEN** a request to load the last N messages of a branch
- **WHEN** load_messages_range is called
- **THEN** the message index SHALL be consulted
- **AND** only the specified range of message files SHALL be read
- **AND** messages SHALL be loaded in the correct order
- **AND** the range SHALL be efficiently determined without reading all messages

#### Scenario: Lazy loading during iteration

- **GIVEN** code is iterating over branch messages
- **WHEN** a message is accessed that is not yet loaded
- **THEN** the message SHALL be loaded on-demand
- **AND** the load SHALL be transparent to the caller
- **AND** loaded messages SHALL be cached in message_pool
- **AND** subsequent accesses SHALL not trigger additional I/O

### Requirement: Incremental Message Saving

The storage system SHALL support saving individual messages without rewriting the entire context.

#### Scenario: Saving a new message

- **GIVEN** a new message is added to a branch
- **WHEN** save_message is called
- **THEN** only the new message file SHALL be written
- **AND** the message file path SHALL be `messages/branch-{name}/{message_id}.json`
- **AND** the message index SHALL be updated
- **AND** the metadata file SHALL NOT be rewritten
- **AND** the operation SHALL be atomic (write to temp file, then rename)

#### Scenario: Updating context metadata

- **GIVEN** context configuration or branch structure changes
- **WHEN** save_context_metadata is called
- **THEN** only metadata.json SHALL be rewritten
- **AND** message files SHALL NOT be touched
- **AND** the update SHALL be atomic

#### Scenario: Batch message save

- **GIVEN** multiple messages are added in quick succession
- **WHEN** batch_save_messages is called
- **THEN** all message files SHALL be written concurrently
- **AND** the index SHALL be updated once after all writes
- **AND** failures SHALL be handled gracefully (partial success possible)

### Requirement: Storage Performance Optimization

The separated storage system SHALL provide measurable performance improvements over monolithic storage.

#### Scenario: Large context loading performance

- **GIVEN** a context with 1000+ messages
- **WHEN** loading the context metadata only
- **THEN** loading SHALL complete in <100ms
- **AND** memory usage SHALL be <1MB
- **AND** this SHALL be significantly faster than loading the full monolithic file

#### Scenario: Adding message to large context

- **GIVEN** a context with 1000+ messages
- **WHEN** adding a new message
- **THEN** only the new message file SHALL be written
- **AND** the operation SHALL complete in <50ms
- **AND** this SHALL be significantly faster than rewriting the entire context

#### Scenario: Concurrent message reads

- **GIVEN** multiple clients are reading different messages from the same context
- **WHEN** reads happen concurrently
- **THEN** reads SHALL not block each other (no lock on entire context)
- **AND** each message file SHALL be read independently
- **AND** concurrent read performance SHALL scale linearly

### Requirement: Data Migration from Monolithic Storage

The system SHALL provide tools to migrate existing monolithic context files to the separated storage format.

#### Scenario: Detecting old format contexts

- **GIVEN** a context file in the old monolithic format (single JSON file)
- **WHEN** the storage system initializes
- **THEN** the old format SHALL be detected
- **AND** the context SHALL still be loadable (backward compatibility)
- **AND** a migration flag SHALL be set

#### Scenario: Automatic migration on first access

- **GIVEN** an old format context is being loaded
- **WHEN** load_context is called with auto_migrate=true
- **THEN** the context SHALL be loaded from the old file
- **AND** the context SHALL be immediately saved in the new format
- **AND** the old file SHALL be backed up (renamed with .old suffix)
- **AND** the migration SHALL be transparent to the caller

#### Scenario: Batch migration tool

- **GIVEN** many contexts in old format
- **WHEN** the migration tool is run
- **THEN** all old format contexts SHALL be discovered
- **AND** each context SHALL be migrated to new format
- **AND** progress SHALL be reported
- **AND** errors SHALL be logged but not stop the batch
- **AND** old files SHALL be backed up

#### Scenario: Migration validation

- **GIVEN** a context has been migrated
- **WHEN** validation is performed
- **THEN** the metadata SHALL be compared with the original
- **AND** all message IDs SHALL match
- **AND** all message content SHALL be preserved
- **AND** branch structures SHALL be identical
- **AND** any discrepancies SHALL be reported

### Requirement: Storage Integrity and Consistency

The separated storage system SHALL maintain data integrity and consistency across metadata, messages, and index.

#### Scenario: Atomic directory creation

- **GIVEN** a new context is being saved for the first time
- **WHEN** save_context is called
- **THEN** the context directory SHALL be created atomically
- **AND** if creation fails, no partial state SHALL remain
- **AND** the operation SHALL be retryable

#### Scenario: Index consistency check

- **GIVEN** a context is loaded
- **WHEN** consistency check is performed
- **THEN** every message_id in the index SHALL have a corresponding file
- **AND** every message file SHALL have an entry in the index
- **AND** branch.message_ids SHALL match index entries
- **AND** inconsistencies SHALL be reported and auto-corrected if possible

#### Scenario: Orphaned message cleanup

- **GIVEN** message files exist that are not referenced by any branch
- **WHEN** garbage collection is triggered
- **THEN** orphaned messages SHALL be identified
- **AND** orphaned messages SHALL be moved to a trash directory
- **AND** orphaned messages SHALL be deleted after a grace period (e.g., 7 days)
- **AND** the index SHALL be updated

#### Scenario: Corruption recovery

- **GIVEN** a message file is corrupted or missing
- **WHEN** loading the context
- **THEN** the corrupted message SHALL be identified
- **AND** the context SHALL still load (with a warning)
- **AND** the corrupted message SHALL be marked as unavailable
- **AND** the system SHALL attempt to recover from backup if available

### Requirement: Storage Space Management

The separated storage system SHALL provide mechanisms to manage disk space usage.

#### Scenario: Context size reporting

- **GIVEN** a context with separated storage
- **WHEN** querying context size
- **THEN** the total size SHALL include metadata + all message files
- **AND** the size SHALL be calculated efficiently (using index, not scanning)
- **AND** per-branch sizes SHALL be reportable

#### Scenario: Old message archival

- **GIVEN** a context with very old messages (e.g., >6 months)
- **WHEN** archival is triggered
- **THEN** old messages SHALL be compressed
- **AND** compressed messages SHALL be moved to an archive directory
- **AND** the index SHALL be updated to reflect archived status
- **AND** archived messages SHALL still be loadable (decompressed on-demand)

#### Scenario: Context compression

- **GIVEN** a context that is rarely accessed
- **WHEN** compression is triggered
- **THEN** all message files SHALL be compressed into a single archive
- **AND** the metadata SHALL remain uncompressed
- **AND** on next access, messages SHALL be decompressed on-demand
- **AND** compression SHALL save significant disk space (>50% typically)

### Requirement: Backward Compatibility

The storage system SHALL maintain compatibility with existing code and old storage formats during transition.

#### Scenario: Dual-format support

- **GIVEN** the system has both old and new format contexts
- **WHEN** loading a context
- **THEN** the format SHALL be auto-detected
- **AND** old format contexts SHALL load successfully
- **AND** new format contexts SHALL load successfully
- **AND** the loading interface SHALL be the same for both

#### Scenario: Transparent migration

- **GIVEN** code that loads a context
- **WHEN** the context is in old format
- **THEN** the code SHALL receive a valid ChatContext
- **AND** the migration SHALL happen transparently
- **AND** the code SHALL not need to know about the format difference

#### Scenario: Rollback support

- **GIVEN** a need to rollback to old storage format
- **WHEN** the rollback is performed
- **THEN** new format contexts SHALL be convertible back to old format
- **AND** the conversion SHALL preserve all data
- **AND** backup files SHALL facilitate rollback

## REMOVED Requirements

None. This is a new capability spec.

