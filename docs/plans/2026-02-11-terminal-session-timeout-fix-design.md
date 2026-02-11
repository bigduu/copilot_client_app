# Terminal Session Timeout Semantics Design

Goal: Make terminal session timeouts inactivity-based and honor read_output timeouts by waiting briefly for new output when the buffer is empty.

Non-goals: No changes to command parsing, output formatting, or session concurrency limits. No new signaling channels beyond simple polling.

## Architecture
The session lifecycle continues to be managed by TerminalSessionTool with per-session state in Session. The existing last_activity timestamp (updated on stdout/stderr output and on send_input) becomes the single source of truth for inactivity. A renamed constant DEFAULT_SESSION_INACTIVITY_TIMEOUT defines the default idle window. Cleanup uses is_inactive() to determine which sessions to terminate, rather than elapsed time since creation.

## Components and Data Flow
- Output capture tasks: The stdout and stderr reader tasks append tagged lines to output_buffer and update last_activity when new lines arrive.
- Input path: send_input continues to write to stdin and updates last_activity.
- ReadOutput path: read_output reads a snapshot of the buffer. If the snapshot is empty and timeout_seconds > 0, it polls the buffer until output arrives or the timeout elapses. This preserves the existing buffer snapshot semantics while honoring the timeout parameter.

## Error Handling and Edge Cases
- If timeout_seconds == 0, read_output returns immediately without waiting.
- When the buffer remains empty for the full timeout, the tool returns the existing No
