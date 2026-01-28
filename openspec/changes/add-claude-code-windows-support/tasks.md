- [ ] 1.1 Run openspec validate add-claude-code-windows-support --strict and fix all findings

## 2. Backend (Tauri) - Windows Claude Code Execution

- [ ] 2.1 Normalize Windows Claude binary paths to prefer executable targets (.exe/.cmd/.bat)
- [ ] 2.2 Execute .cmd/.bat paths via cmd /C for version checks and run commands
- [ ] 2.3 Update command environment inheritance and PATH handling for Windows
- [ ] 2.4 Make project ID encoding/decoding handle Windows paths safely

## 3. Frontend - Windows Path Handling

- [ ] 3.1 Normalize path parsing for project name/labels on Windows
- [ ] 3.2 Ensure project ID derivation matches backend encoding for Windows

## 4. Tests

- [ ] 4.1 Add unit tests for Windows path normalization and project ID encoding/decoding
