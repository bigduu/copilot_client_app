## ADDED Requirements

### Requirement: Backend System Prompt Enhancement with API Path Distinction
The system SHALL generate enhanced system prompts on the backend only for context-based endpoints, while preserving original prompts for OpenAI-compatible passthrough endpoints.

#### Scenario: Detect passthrough vs context-based request
- **GIVEN** an incoming LLM request
- **WHEN** backend processes the request
- **THEN** it SHALL determine if request is from passthrough API (e.g., `/v1/chat/completions`) or context API (e.g., `/context/chat/*`)
- **AND** use original prompt for passthrough mode
- **AND** use enhanced prompt for context mode

#### Scenario: Passthrough mode preserves original prompt
- **GIVEN** request to `/v1/chat/completions` from external client (e.g., Cline)
- **WHEN** backend prepares LLM request
- **THEN** it SHALL use the base system prompt without any enhancement
- **AND** NOT inject tool definitions
- **AND** NOT inject mermaid instructions
- **AND** preserve standard OpenAI API behavior

#### Scenario: Context mode uses enhanced prompt
- **GIVEN** request from our frontend via context API
- **WHEN** backend prepares prompt for LLM request
- **THEN** it SHALL inject all available tool definitions
- **AND** format tools as structured text (XML or markdown)
- **AND** include tool calling convention instructions
- **AND** enable agent loop behavior

#### Scenario: Enhanced prompt endpoint
- **WHEN** GET `/v1/system-prompts/{id}/enhanced` is called
- **THEN** it SHALL return the base prompt with injected tools and enhancements
- **AND** the response SHALL be ready to send directly to LLM
- **AND** include cache headers for performance

#### Scenario: Tool definition format in prompt
- **WHEN** injecting tool definitions
- **THEN** each tool SHALL be formatted with: `<tool>` wrapper, `<name>`, `<description>`, `<parameters>` with individual `<parameter>` tags
- **AND** the format SHALL be concise to minimize token usage
- **AND** include JSON calling convention instructions at the top

### Requirement: Tool-to-Prompt Conversion
The system SHALL convert tool registry definitions into LLM-consumable prompt text.

#### Scenario: Convert tool definition to prompt text
- **GIVEN** a tool with name, description, and parameters
- **WHEN** converting to prompt format
- **THEN** it SHALL output structured text like:
  ```
  <tool>
    <name>read_file</name>
    <description>Read contents of a file from the filesystem</description>
    <parameters>
      <parameter name="path" type="string" required="true">Path to the file to read</parameter>
      <parameter name="encoding" type="string" required="false">File encoding (default: utf-8)</parameter>
    </parameters>
  </tool>
  ```

#### Scenario: Include tool calling instructions
- **WHEN** generating enhanced prompt
- **THEN** it SHALL prepend instructions for JSON tool call format
- **AND** explain `terminate` flag behavior
- **AND** provide example tool call JSON

### Requirement: Prompt Enhancement Service
The system SHALL provide a `SystemPromptEnhancerService` on the backend for prompt augmentation.

#### Scenario: Service integrates with tool registry
- **GIVEN** SystemPromptEnhancerService is initialized
- **WHEN** generating enhanced prompt
- **THEN** it SHALL query ToolRegistry for available tools
- **AND** convert tools to prompt format
- **AND** append to base prompt

#### Scenario: Service supports multiple enhancement types
- **WHEN** enhancing a prompt
- **THEN** service SHALL support: tool definitions, mermaid diagram instructions, custom context
- **AND** each enhancement SHALL be toggleable via configuration
- **AND** enhancements SHALL be applied in consistent order

#### Scenario: Prompt size optimization
- **GIVEN** total prompt size exceeds a threshold (e.g., 8000 tokens)
- **WHEN** generating enhanced prompt
- **THEN** service MAY prioritize most relevant tools
- **AND** truncate or abbreviate less critical tools
- **AND** log warning about prompt size

### Requirement: Integration with OpenAI Controller
The OpenAI controller SHALL use enhanced prompts when making LLM requests.

#### Scenario: Fetch enhanced prompt for chat
- **GIVEN** a chat request with system prompt ID
- **WHEN** OpenAI controller prepares LLM request
- **THEN** it SHALL call SystemPromptEnhancerService to get enhanced prompt
- **AND** use enhanced prompt as system message
- **AND** NOT use base prompt directly

#### Scenario: Cache enhanced prompts
- **WHEN** same system prompt is used multiple times
- **THEN** the enhanced version MAY be cached
- **AND** cache SHALL be invalidated when tools change
- **AND** cache SHALL have TTL (e.g., 5 minutes)

### Requirement: Mermaid Diagram Enhancement
The system SHALL continue to support Mermaid diagram enhancement in system prompts.

#### Scenario: Inject Mermaid instructions
- **WHEN** enhancing a prompt with Mermaid enabled
- **THEN** it SHALL append Mermaid diagram generation instructions
- **AND** include syntax examples
- **AND** specify when to use diagrams

#### Scenario: Mermaid enhancement is optional
- **GIVEN** Mermaid enhancement is disabled in config
- **WHEN** generating enhanced prompt
- **THEN** Mermaid instructions SHALL NOT be included

## REMOVED Requirements

### Requirement: Frontend System Prompt Enhancement
**Reason**: System prompt enhancement now happens on backend only.

**Migration**: Remove `SystemPromptEnhancer.ts` from frontend. Frontend should not know about tool definitions.

### Requirement: Frontend Tool Definition Fetching for Prompts
**Reason**: Frontend no longer needs to fetch tools to inject into prompts.

**Migration**: Remove `ToolService.getAllToolsForPrompt()` method from frontend.

