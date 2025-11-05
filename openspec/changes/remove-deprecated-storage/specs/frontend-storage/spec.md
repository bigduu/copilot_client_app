## REMOVED Requirements

### Requirement: LocalStorage Chat Management

**Reason**: Chat data management has been moved to the backend Context Manager. LocalStorage-based chat persistence is no longer needed and causes console warnings.

**Migration**: All chat data is now managed by the backend via `BackendContextService`. The frontend uses REST API calls for all chat operations.

**Removed Methods**:

- `StorageService.saveAllData()`
- `StorageService.saveChats()`
- `StorageService.saveMessages()`
- `StorageService.deleteMessages()`
- `StorageService.deleteMultipleMessages()`
- `StorageService.loadMessages()`
- `StorageService.loadLatestActiveChatId()`
- `StorageService.saveLatestActiveChatId()`
- `StorageService.loadChats()`
- `StorageService.saveSystemPrompts()`
- `StorageService.getSystemPrompts()`

#### Scenario: Chat data no longer persisted to LocalStorage

- **WHEN** user creates a new chat
- **THEN** chat data SHALL be sent to backend via `BackendContextService.createContext()`
- **AND** chat data SHALL NOT be saved to LocalStorage

#### Scenario: Message data managed by backend

- **WHEN** user sends a message
- **THEN** message SHALL be sent to backend via `BackendContextService.addMessage()`
- **AND** message SHALL NOT be saved to LocalStorage

#### Scenario: Clean console output

- **WHEN** user performs any chat operation
- **THEN** no deprecation warnings SHALL appear in console
- **AND** no LocalStorage writes SHALL occur for chat data

### Requirement: Zustand Store Chat Persistence

**Reason**: The `saveChats` action in the Zustand store was responsible for calling deprecated LocalStorage methods. With backend-first architecture, this action is no longer needed.

**Migration**: Chat state synchronization is handled by the backend Context Manager. The frontend fetches data on demand rather than persisting locally.

**Removed Actions**:

- `chatSessionSlice.saveChats()`
- Debounced storage subscriber in `store/index.ts`

#### Scenario: Chat creation without local persistence

- **WHEN** `addChat()` is called in the store
- **THEN** chat SHALL be added to Zustand state
- **AND** backend SHALL be notified via API
- **AND** `saveChats()` SHALL NOT be called

#### Scenario: State changes without storage writes

- **WHEN** any chat state changes occur
- **THEN** Zustand state SHALL update immediately
- **AND** no debounced LocalStorage writes SHALL occur

## MODIFIED Requirements

### Requirement: StorageService Scope

The StorageService SHALL only manage UI preferences and user settings, not chat data.

**Retained Functionality**:

- Theme preferences (light/dark mode)
- Layout preferences (sidebar collapsed state)
- User interface settings
- Non-chat-related application state

**Removed Functionality**:

- Chat metadata storage
- Message storage
- System prompt storage
- Chat-related state persistence

#### Scenario: UI preferences still work

- **WHEN** user changes theme preference
- **THEN** preference SHALL be saved to LocalStorage
- **AND** preference SHALL persist across sessions

#### Scenario: Chat data uses backend

- **WHEN** user needs to access chat data
- **THEN** data SHALL be fetched from backend API
- **AND** data SHALL NOT be read from LocalStorage
