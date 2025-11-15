## ADDED Requirements

### Requirement: Backend Session State Management

The system SHALL provide a backend Session Manager that maintains user session state with full CRUD API access for frontend clients.

#### Scenario: Loading session via API

- **GIVEN** a frontend client requests session state
- **WHEN** GET /api/session is called
- **THEN** the backend SHALL return the UserSession for the current user
- **AND** if no session exists, a default session SHALL be created
- **AND** the session SHALL include active_context_id, open_contexts, ui_state, and preferences
- **AND** the response SHALL be in JSON format

#### Scenario: Updating session state via API

- **GIVEN** the user modifies session state in the frontend
- **WHEN** the frontend calls PUT /api/session with updated state
- **THEN** the backend SHALL validate the new state
- **AND** the backend SHALL persist the updated state to storage
- **AND** the response SHALL confirm the update
- **AND** concurrent updates SHALL be handled safely (last-write-wins or conflict detection)

#### Scenario: Session state structure

- **GIVEN** a UserSession is being managed
- **THEN** the state SHALL include:
  - user_id (optional, for future multi-user support)
  - active_context_id (currently focused conversation)
  - open_contexts (list of open tabs with title, last_access_time, order)
  - ui_state (sidebar_collapsed, sidebar_width, context_expanded, active_panel)
  - preferences (theme, font_size, auto_save, default_model, tool_approval_policy)
  - last_updated (timestamp)
- **AND** the state SHALL be serializable to JSON
- **AND** the state SHALL be validated before persistence

### Requirement: Active Context Management

The Session Manager SHALL track and manage the currently active conversation context.

#### Scenario: Setting active context via API

- **GIVEN** a frontend client wants to switch contexts
- **WHEN** PUT /api/session/active-context is called with a context_id
- **THEN** the backend SHALL update active_context_id in UserSession
- **AND** the backend SHALL verify the context exists
- **AND** if the context doesn't exist, an error SHALL be returned
- **AND** the session SHALL be persisted
- **AND** the frontend SHALL receive confirmation

#### Scenario: Active context restoration

- **GIVEN** a frontend client loads the session
- **WHEN** the session contains an active_context_id
- **THEN** the frontend SHALL request that context from the backend
- **AND** if the context still exists, it SHALL be loaded
- **AND** if the context was deleted, active_context_id SHALL be set to null
- **AND** the frontend SHALL handle the null case appropriately

#### Scenario: No active context

- **GIVEN** the session has active_context_id set to null
- **WHEN** the frontend renders
- **THEN** the UI SHALL display an empty state or welcome screen
- **AND** the user SHALL be prompted to create or open a context
- **AND** the session state SHALL remain valid

### Requirement: Multi-Context Tabs Management

The Session Manager SHALL support managing multiple open contexts simultaneously (tab-like behavior).

#### Scenario: Opening a context via API

- **GIVEN** the frontend wants to open a context
- **WHEN** POST /api/session/open-contexts is called with a context_id
- **THEN** the backend SHALL add an OpenContext entry to the session
- **AND** the entry SHALL include context_id, title, last_access_time, and order
- **AND** if already open, the last_access_time SHALL be updated
- **AND** the context SHALL become the active context
- **AND** the session SHALL be persisted

#### Scenario: Closing a context via API

- **GIVEN** a context is currently open
- **WHEN** DELETE /api/session/open-contexts/{context_id} is called
- **THEN** the backend SHALL remove the context from open_contexts
- **AND** if it was the active context, the next most recent SHALL become active
- **AND** if no other contexts are open, active_context_id SHALL be set to null
- **AND** the session SHALL be persisted

#### Scenario: Maximum open contexts limit

- **GIVEN** the user preferences specify a max_open_contexts limit
- **WHEN** opening a context would exceed the limit
- **THEN** the backend SHALL automatically close the least recently accessed context
- **AND** a notification SHALL be included in the response
- **AND** the limit SHALL be configurable in UserPreferences

#### Scenario: Reordering open contexts via API

- **GIVEN** multiple contexts are open
- **WHEN** PUT /api/session/open-contexts/order is called with new order
- **THEN** the backend SHALL update the order field for each OpenContext
- **AND** the new order SHALL be persisted
- **AND** the order SHALL be respected in subsequent GET requests
- **AND** the contexts themselves SHALL not be affected

### Requirement: UI State Persistence

The Session Manager SHALL persist and restore UI layout and component states.

#### Scenario: UI state update via API

- **GIVEN** the user modifies UI state in the frontend
- **WHEN** PUT /api/session/ui-state is called with updated UIState
- **THEN** the backend SHALL update the ui_state in UserSession
- **AND** the update SHALL include sidebar_collapsed, sidebar_width, context_expanded, active_panel
- **AND** the state SHALL be validated (e.g., width > 0, width < max)
- **AND** the session SHALL be persisted
- **AND** the frontend MAY debounce updates to reduce API calls

#### Scenario: UI state restoration

- **GIVEN** the frontend loads the session
- **WHEN** the session contains ui_state
- **THEN** the frontend SHALL apply the saved UI state
- **AND** sidebar SHALL restore to saved collapsed state and width
- **AND** context expansion states SHALL be restored per context_id
- **AND** active panel SHALL be restored if still valid
- **AND** invalid states SHALL fall back to defaults

#### Scenario: Context-specific expansion state

- **GIVEN** the ui_state contains context_expanded map
- **WHEN** the user expands or collapses a context in the list
- **THEN** the frontend SHALL update the map {context_id: boolean}
- **AND** the update SHALL be sent to the backend
- **AND** when loading the session, each context SHALL restore its expansion state
- **AND** contexts not in the map SHALL default to collapsed

### Requirement: User Preferences Management

The Session Manager SHALL manage user preferences that affect the application behavior and appearance.

#### Scenario: User preferences update via API

- **GIVEN** the user modifies preferences in the frontend
- **WHEN** PUT /api/session/preferences is called with updated UserPreferences
- **THEN** the backend SHALL update the preferences in UserSession
- **AND** the update SHALL include theme, font_size, auto_save, default_model, tool_approval_policy
- **AND** the preferences SHALL be validated
- **AND** the session SHALL be persisted
- **AND** the frontend SHALL receive confirmation

#### Scenario: Preferences restoration

- **GIVEN** the frontend loads the session
- **WHEN** the session contains preferences
- **THEN** the frontend SHALL apply the saved preferences
- **AND** theme SHALL be applied to the UI
- **AND** font_size SHALL be applied to text areas
- **AND** auto_save SHALL be enabled/disabled according to preference
- **AND** default_model SHALL be pre-selected for new contexts
- **AND** tool_approval_policy SHALL affect tool execution behavior

#### Scenario: Theme preference synchronization

- **GIVEN** a user changes theme preference
- **WHEN** the preference is updated in the backend
- **THEN** if multiple clients are connected, they SHALL all receive the update
- **AND** each client SHALL apply the new theme
- **AND** the preference SHALL be consistent across devices

### Requirement: Backend Session Storage

The Session Manager SHALL efficiently persist session state to the filesystem with appropriate error handling.

#### Scenario: Session file storage

- **GIVEN** a UserSession needs to be persisted
- **WHEN** the backend saves the session
- **THEN** the session SHALL be saved to user_sessions/default_session.json
- **AND** for multi-user support, {user_id}_session.json SHALL be used
- **AND** writes SHALL be atomic (write to temp file, then rename)
- **AND** file permissions SHALL be appropriate

#### Scenario: Session loading on startup

- **GIVEN** the backend starts
- **WHEN** loading the session
- **THEN** the session file SHALL be read from disk
- **AND** if the file doesn't exist, a default session SHALL be created
- **AND** if the file is corrupted, an error SHALL be logged and default session used
- **AND** the loaded session SHALL be cached in memory

#### Scenario: Session caching in memory

- **GIVEN** frequent session updates are expected
- **WHEN** managing the session
- **THEN** the UserSession SHALL be kept in memory
- **AND** updates SHALL modify the in-memory copy
- **AND** persistence to disk SHALL be throttled (e.g., debounced or every N seconds)
- **AND** critical updates MAY trigger immediate persistence

#### Scenario: Session migration

- **GIVEN** the session schema changes in a new version
- **WHEN** loading an old session file
- **THEN** the backend SHALL detect the old version
- **AND** the state SHALL be migrated to the new schema
- **AND** migration SHALL preserve all compatible data
- **AND** the migrated state SHALL be saved with the new schema
- **AND** a backup of the old file SHALL be created

### Requirement: Session Lifecycle Management

The Session Manager SHALL handle the complete lifecycle of a user session from initialization to cleanup.

#### Scenario: Session initialization on backend startup

- **GIVEN** the backend starts
- **WHEN** SessionManager initializes
- **THEN** the session file SHALL be loaded from disk
- **AND** if the file is missing, a default session SHALL be created
- **AND** state validity SHALL be checked
- **AND** invalid state SHALL be reset to defaults
- **AND** the session SHALL be cached in memory

#### Scenario: Session cleanup on shutdown

- **GIVEN** the backend is shutting down
- **WHEN** the shutdown signal is received
- **THEN** the current session state SHALL be persisted to disk
- **AND** the save SHALL be synchronous to ensure completion
- **AND** proper file locks SHALL be released
- **AND** the shutdown SHALL wait for persistence to complete

#### Scenario: Frontend reconnection

- **GIVEN** a frontend client reconnects after disconnection
- **WHEN** the client requests the session
- **THEN** the backend SHALL return the current session state
- **AND** the client SHALL sync its local state with the backend
- **AND** any conflicting changes SHALL use server state as truth
- **AND** the client SHALL update its UI accordingly

#### Scenario: Multi-client synchronization

- **GIVEN** multiple frontend clients are connected
- **WHEN** one client updates the session
- **THEN** the backend SHALL persist the update
- **AND** other clients MAY poll for updates periodically
- **AND** OR the backend MAY push updates via WebSocket/SSE (optional)
- **AND** conflicts SHALL be resolved using last-write-wins strategy

## MODIFIED Requirements

### Requirement: Backend Session Manager - Dual Responsibility

The backend Session Manager SHALL manage both ChatContext caching (for performance) and UserSession state (for multi-client consistency).

**Changes from original design**:
- EXPANDED: Now manages UserSession in addition to Context caching
- ADDED: RESTful API for session CRUD operations
- ADDED: UserSession storage and lifecycle management
- KEEP: Context caching with LRU eviction
- KEEP: Concurrent read access via RwLock
- KEEP: Context persistence coordination

#### Scenario: Context caching

- **GIVEN** a context is loaded from storage
- **WHEN** the context is cached
- **THEN** subsequent requests SHALL hit the cache
- **AND** the cache SHALL use LRU eviction policy
- **AND** the cache SHALL be independent of UserSession

#### Scenario: UserSession management

- **GIVEN** frontend requests session state
- **WHEN** GET /api/session is called
- **THEN** the backend SHALL return the cached UserSession
- **AND** if not cached, it SHALL be loaded from disk
- **AND** the UserSession SHALL be kept in memory for fast access
- **AND** updates SHALL be persisted asynchronously (with throttling)

## REMOVED Requirements

None. The backend Session Manager requirements are being modified, not removed.

