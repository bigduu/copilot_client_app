## MODIFIED Requirements

### Requirement: Opcode-Compatible Claude Code Commands

The application SHALL execute Claude Code in a Windows-compatible manner when running on Windows hosts.

#### Scenario: Windows npm shim resolution

- **GIVEN** the resolved Claude binary path is a Windows npm shim without a runnable extension
- **WHEN** the backend prepares to check the version or execute Claude Code
- **THEN** it resolves an executable target (such as `claude.cmd` or `claude.exe`) and invokes it via `cmd /C`

#### Scenario: Windows project IDs

- **GIVEN** a Windows project path (including drive letters and backslashes)
- **WHEN** the backend creates or resolves a project ID
- **THEN** the project ID encodes the Windows path safely and can be decoded back to the original path
