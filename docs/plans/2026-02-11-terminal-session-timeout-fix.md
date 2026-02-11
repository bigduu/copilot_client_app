# Terminal Session Timeout Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Switch terminal session timeouts to inactivity-based semantics and honor read_output timeouts by waiting for new output when the buffer is empty.

**Architecture:** Keep last_activity as the source of truth for inactivity. Rename the default timeout constant to reflect inactivity. ReadOutput will poll the output buffer until it has lines or the timeout expires.

**Tech Stack:** Rust, Tokio, DashMap.

---

### Task 1: Inactivity-based timeout semantics

**Files:**
- Modify: `crates/agent-tools/src/tools/terminal_session.rs`
- Test: `crates/agent-tools/src/tools/terminal_session.rs`

**Step 1: Write the failing test**

Add this test in the existing tests module:

```rust
#[tokio::test]
async fn test_is_timed_out_uses_last_activity() {
    let mut session = Session::new(
        "session_timeout_test".to_string(),
        "sleep 10".to_string(),
        None,
        None,
    )
    .await
    .unwrap();

    // Simulate an old creation time but recent activity.
    session.created_at = Instant::now() - Duration::from_secs(301);
    *session.last_activity.lock().await = Instant::now();

    assert!(!session.is_timed_out());

    let _ = session.kill().await;
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p agent-tools test_is_timed_out_uses_last_activity`
Expected: FAIL because is_timed_out uses created_at.

**Step 3: Write minimal implementation**

Update terminal_session.rs:
- Rename DEFAULT_SESSION_TIMEOUT to DEFAULT_SESSION_INACTIVITY_TIMEOUT and update its comment.
- Update is_timed_out() to use last_activity (via is_inactive).
- Make is_inactive() a synchronous check using last_activity.try_lock().
- Update the cleanup task to call is_inactive(DEFAULT_SESSION_INACTIVITY_TIMEOUT).

Example snippets:

```rust
const DEFAULT_SESSION_INACTIVITY_TIMEOUT: Duration = Duration::from_secs(300);

fn is_timed_out(&self) -> bool {
    self.is_inactive(DEFAULT_SESSION_INACTIVITY_TIMEOUT)
}

fn is_inactive(&self, max_inactive: Duration) -> bool {
    match self.last_activity.try_lock() {
        Ok(last) => last.elapsed() > max_inactive,
        Err(_) => false,
    }
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test -p agent-tools test_is_timed_out_uses_last_activity`
Expected: PASS.

**Step 5: Commit**

```bash
git add crates/agent-tools/src/tools/terminal_session.rs
git commit -m "fix: base terminal session timeout on inactivity"
```

---

### Task 2: Honor read_output timeout_seconds

**Files:**
- Modify: `crates/agent-tools/src/tools/terminal_session.rs`
- Test: `crates/agent-tools/src/tools/terminal_session.rs`

**Step 1: Write the failing test**

Add this test in the existing tests module:

```rust
#[tokio::test]
async fn test_read_output_waits_for_timeout_seconds() {
    let tool = TerminalSessionTool::new();

    let result = tool
        .execute(serde_json::json!({
            "action": "start",
            "command": "sleep 10"
        }))
        .await
        .unwrap();

    assert!(result.success);

    let session_line = result.result.lines().next().unwrap();
    let session_id = session_line
        .trim_start_matches("Session '")
        .trim_end_matches("' started")
        .to_string();

    let (buffer, activity) = {
        let session = tool.sessions.get(&session_id).unwrap();
        (session.output_buffer.clone(), session.last_activity.clone())
    };

    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(100)).await;
        buffer.lock().await.push("[stdout] delayed".to_string());
        *activity.lock().await = Instant::now();
    });

    let result = tool
        .execute(serde_json::json!({
            "action": "read_output",
            "session_id": session_id,
            "max_lines": 10,
            "timeout_seconds": 1
        }))
        .await
        .unwrap();

    assert!(result.success);
    assert!(result.result.contains("delayed"));

    let _ = tool
        .execute(serde_json::json!({
            "action": "kill",
            "session_id": session_id
        }))
        .await;
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test -p agent-tools test_read_output_waits_for_timeout_seconds`
Expected: FAIL because read_output returns immediately with no output.

**Step 3: Write minimal implementation**

Update read_output handling to honor timeout_seconds:
- Change TerminalSessionTool::read_output to accept timeout_seconds.
- If read_output returns empty and timeout_seconds > 0, poll in a loop until output arrives or the timeout elapses.
- Keep the existing "No output available" response when nothing arrives.

Example snippet:

```rust
async fn read_output(
    &self,
    session_id: &str,
    max_lines: usize,
    timeout_seconds: u64,
) -> Result<Vec<String>, String> {
    let timeout = Duration::from_secs(timeout_seconds);
    let start = Instant::now();

    loop {
        let lines = {
            let session = self
                .sessions
                .get(session_id)
                .ok_or_else(|| format!("Session '{}' not found", session_id))?;
            session.read_output(max_lines).await
        };

        if !lines.is_empty() || timeout_seconds == 0 || start.elapsed() >= timeout {
            return Ok(lines);
        }

        tokio::time::sleep(Duration::from_millis(50)).await;
    }
}
```

Update execute() to pass timeout_seconds to read_output.

**Step 4: Run test to verify it passes**

Run: `cargo test -p agent-tools test_read_output_waits_for_timeout_seconds`
Expected: PASS.

**Step 5: Commit**

```bash
git add crates/agent-tools/src/tools/terminal_session.rs
git commit -m "fix: wait for output up to timeout_seconds"
```

---

### Task 3: Documentation updates

**Files:**
- Modify: `crates/agent-tools/src/tools/terminal_session.rs`

**Step 1: Update docs**

- Update the security comment to say sessions are cleaned up after inactivity.
- Update the timeout constant comment to mention inactivity.
- Clarify the ReadOutput timeout_seconds field description to note that it waits when the buffer is empty.

**Step 2: Run relevant tests**

Run: `cargo test -p agent-tools terminal_session`
Expected: PASS.

**Step 3: Commit**

```bash
git add crates/agent-tools/src/tools/terminal_session.rs
git commit -m "docs: clarify terminal session timeout behavior"
```
