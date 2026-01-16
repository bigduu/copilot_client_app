## ADDED Requirements

### Requirement: Headless Device-Code Authorization
When headless auth mode is enabled, the backend SHALL support GitHub device-code authorization without requiring GUI features.

#### Scenario: Headless login instructions are printed
- **GIVEN** the backend needs to perform GitHub device-code authorization
- **AND** headless auth mode is enabled
- **WHEN** the device code is issued
- **THEN** the backend prints the `verification_uri` and `user_code` for manual copy/paste
- **AND** the backend does not attempt to open a browser, access clipboard, or display native dialogs
