# mcp-server-management Specification

## REMOVED Requirements

### Requirement: MCP configuration storage

**Reason**: MCP support is removed; there is no MCP configuration file.
**Migration**: Delete or ignore `~/.bodhi/mcp_servers.json` and any UI references.

#### Scenario: MCP config not used

- **WHEN** the application starts
- **THEN** it does not load or persist `~/.bodhi/mcp_servers.json`

### Requirement: MCP server management API

**Reason**: MCP endpoints are removed.
**Migration**: Remove calls to `/mcp/servers`, `/mcp/reload`, and `/mcp/status/*`.

#### Scenario: MCP endpoints unavailable

- **WHEN** a client calls `/mcp/servers`
- **THEN** the request is rejected because MCP support is removed

### Requirement: Enable/disable servers

**Reason**: There are no MCP servers to enable or disable.
**Migration**: Remove any UI toggles or configuration fields for MCP enablement.

#### Scenario: No MCP enablement

- **WHEN** the application loads tool sources
- **THEN** it does not evaluate MCP server enablement flags

### Requirement: Frontend-driven config refresh

**Reason**: MCP configuration is removed.
**Migration**: Remove any polling or refresh logic for MCP configuration.

#### Scenario: No MCP config refresh

- **WHEN** the frontend refreshes settings
- **THEN** it does not request MCP configuration updates
