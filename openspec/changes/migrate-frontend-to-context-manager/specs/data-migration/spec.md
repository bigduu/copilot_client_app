## ADDED Requirements

### Requirement: LocalStorage to Backend Migration
The system SHALL provide a utility to migrate existing LocalStorage chat data to backend Context Manager.

#### Scenario: Detect existing LocalStorage data
- **WHEN** app starts with LocalStorage chat data
- **THEN** migration utility detects existing data
- **AND** prompts user to migrate
- **AND** shows data summary (chat count, message count)

#### Scenario: Migrate chat data
- **WHEN** user initiates migration
- **THEN** ChatItem objects are converted to ChatContext
- **AND** messages are mapped from Message[] to InternalMessage
- **AND** system prompts are migrated with ID mapping
- **AND** migration progress is shown

#### Scenario: Handle chat configuration migration
- **WHEN** ChatItem.config is migrated
- **THEN** systemPromptId is mapped to backend prompt ID
- **AND** toolCategory is preserved in ChatConfig
- **AND** chat configuration is complete

#### Scenario: Handle message migration
- **WHEN** messages are migrated
- **THEN** role types are mapped (user, assistant, system, tool)
- **AND** message types are preserved (text, tool_call, tool_result)
- **AND** timestamps are converted to ISO format
- **AND** message IDs are preserved when possible

#### Scenario: Handle tool call migration
- **WHEN** tool call messages are migrated
- **THEN** tool call parameters are preserved
- **AND** tool result data is converted to ToolCallResult
- **AND** approval status is handled appropriately

#### Scenario: Validate migrated data
- **WHEN** migration completes
- **THEN** all chats are validated against backend structure
- **AND** message consistency is checked
- **AND** system prompt references are verified
- **AND** validation report is shown

#### Scenario: Rollback on migration failure
- **WHEN** migration fails or validation fails
- **THEN** rollback mechanism restores LocalStorage
- **AND** no partial data remains in backend
- **AND** error details are logged
- **AND** user is notified of failure

#### Scenario: Preserve LocalStorage as backup
- **WHEN** migration succeeds
- **THEN** original LocalStorage data is preserved for 30 days
- **AND** backup can be used for rollback if needed
- **AND** cleanup process removes old data after retention period

#### Scenario: Handle edge cases
- **WHEN** migration encounters empty chats
- **THEN** empty chat is created in backend with default configuration
- **AND** no error is raised

#### Scenario: Handle malformed data
- **WHEN** migration encounters malformed data
- **THEN** validation catches the issue
- **AND** error is logged with details
- **AND** migration continues with valid data
- **AND** report lists skipped items

#### Scenario: Handle missing references
- **WHEN** system prompt ID references missing prompt
- **THEN** default prompt is assigned
- **AND** warning is logged
- **AND** user is notified in migration report

### Requirement: Data Mapping Specification
The migration SHALL correctly map all data structures between frontend and backend formats.

#### Scenario: Map ChatItem to ChatContext
- **WHEN** ChatItem is converted
- **THEN** id is mapped to ChatContext.id (UUID)
- **AND** config.systemPromptId is mapped to Branch.system_prompt.id
- **AND** config.toolCategory is mapped to ChatConfig.mode
- **AND** messages are mapped to message_pool
- **AND** single branch "main" is created with all messages

#### Scenario: Map Message[] to message_pool
- **WHEN** messages are converted
- **THEN** each Message becomes a MessageNode in the pool
- **AND** message IDs are preserved or generated
- **AND** parent_id relationships are maintained
- **AND** all messages are linked in branch.message_ids

#### Scenario: Map system prompt structure
- **WHEN** UserSystemPrompt is converted
- **THEN** id, name, content are mapped to SystemPrompt
- **AND** prompt is stored in backend
- **AND** ID mapping table is maintained

### Requirement: Migration User Experience
The migration SHALL provide clear feedback and progress indication.

#### Scenario: Show migration progress
- **WHEN** migration is in progress
- **THEN** progress bar shows completion percentage
- **AND** current operation is displayed (e.g., "Migrating chat 3 of 10")
- **AND** elapsed time is shown
- **AND** UI remains responsive

#### Scenario: Show migration summary
- **WHEN** migration completes successfully
- **THEN** summary shows total chats migrated
- **AND** total messages migrated
- **AND** any warnings or skipped items
- **AND** next steps are explained

#### Scenario: Handle migration errors gracefully
- **WHEN** error occurs during migration
- **THEN** error details are displayed clearly
- **AND** options are provided (retry, skip, cancel)
- **AND** no data is left in inconsistent state

## MODIFIED Requirements

### Requirement: App Initialization with Migration Check
App initialization SHALL check for existing LocalStorage data and prompt for migration.

#### Scenario: Check for existing data on startup
- **WHEN** app starts for the first time after migration feature is added
- **THEN** LocalStorage is checked for existing chat data
- **AND** if found, migration prompt is shown
- **AND** app waits for migration completion before normal operation

#### Scenario: Skip migration for new users
- **WHEN** app starts for new user with no existing data
- **THEN** migration is skipped
- **AND** app proceeds to normal initialization
- **AND** no migration UI is shown

## REMOVED Requirements

### Requirement: LocalStorage Chat Storage
**Reason**: All chat data is now stored in backend Context Manager
**Migration**: Existing data is migrated via migration utility, then LocalStorage is used only for UI preferences

