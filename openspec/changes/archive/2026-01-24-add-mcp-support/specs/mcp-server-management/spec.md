## ADDED Requirements

### Requirement: MCP configuration storage

The system SHALL load MCP server configuration from `~/.bodhi/mcp_servers.json` using the `mcpServers` map schema, and persist updates to the same file.

#### Scenario: Missing config file

- **WHEN** the application starts and `~/.bodhi/mcp_servers.json` does not exist
- **THEN** MCP configuration is treated as empty and `GET /mcp/servers` returns an empty `mcpServers` map

### Requirement: MCP server management API

The system SHALL expose HTTP endpoints to read, update, and reload MCP server configuration and to read per-server status.

#### Scenario: Update config via UI

- **WHEN** the frontend submits updated MCP configuration to `POST /mcp/servers`
- **THEN** the backend persists the configuration to `~/.bodhi/mcp_servers.json` and returns the latest configuration on the next `GET /mcp/servers`

#### Scenario: Reload config after manual edit

- **WHEN** the frontend calls `POST /mcp/reload`
- **THEN** the backend reloads `~/.bodhi/mcp_servers.json` and applies it to running MCP clients

### Requirement: Enable/disable servers

The system SHALL honor the `disabled` flag in MCP server configuration by preventing disabled servers from starting and excluding their tools from discovery and execution.

#### Scenario: Disabled server

- **WHEN** a server is configured with `"disabled": true`
- **THEN** its status is not `Running` and its tools are not offered for execution

### Requirement: Frontend-driven config refresh

The system SHALL expose MCP configuration via `GET /mcp/servers` so the frontend can poll for changes and refresh its view.

#### Scenario: Manual file edit

- **WHEN** a user edits `~/.bodhi/mcp_servers.json` while the app is running
- **THEN** a subsequent `GET /mcp/servers` returns the updated configuration
