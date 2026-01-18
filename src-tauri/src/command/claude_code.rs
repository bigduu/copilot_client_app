use anyhow::Context;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(not(unix))]
use std::process::Stdio;
#[cfg(not(unix))]
use tokio::process::Command;

#[derive(Default)]
pub struct ClaudeCodeProcessState {
    pub current_pid: Arc<std::sync::Mutex<Option<u32>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeProject {
    pub id: String,
    pub path: String,
    pub sessions: Vec<String>,
    pub created_at: u64,
    pub most_recent_session: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSession {
    pub id: String,
    pub project_id: String,
    pub project_path: String,
    pub created_at: u64,
    pub modified_at: u64,
    pub first_message: Option<String>,
    pub message_timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct JsonlEntry {
    #[serde(rename = "type")]
    _entry_type: Option<String>,
    message: Option<MessageContent>,
    timestamp: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    role: Option<String>,
    content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ClaudeCodeSettings {
    claude_binary_path: Option<String>,
}

impl Default for ClaudeCodeSettings {
    fn default() -> Self {
        Self {
            claude_binary_path: None,
        }
    }
}

fn home_dir() -> anyhow::Result<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME not set"))
}

fn claude_dir() -> anyhow::Result<PathBuf> {
    Ok(home_dir()?.join(".claude"))
}

fn claude_projects_dir() -> anyhow::Result<PathBuf> {
    Ok(claude_dir()?.join("projects"))
}

fn settings_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let data_dir = app
        .path()
        .app_data_dir()
        .context("Could not resolve app_data_dir")?;
    Ok(data_dir.join("claude_code_settings.json"))
}

fn load_settings(app: &AppHandle) -> anyhow::Result<ClaudeCodeSettings> {
    let path = settings_path(app)?;
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(ClaudeCodeSettings::default()),
        Err(e) => return Err(e).context("Failed to read claude_code_settings.json"),
    };
    let parsed = serde_json::from_str::<ClaudeCodeSettings>(&content)
        .context("Failed to parse claude_code_settings.json")?;
    Ok(parsed)
}

fn save_settings(app: &AppHandle, settings: &ClaudeCodeSettings) -> anyhow::Result<()> {
    let path = settings_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).context("Failed to create settings directory")?;
    }
    fs::write(&path, serde_json::to_string_pretty(settings)?)
        .context("Failed to write claude_code_settings.json")?;
    Ok(())
}

fn looks_like_safe_id(value: &str) -> bool {
    !value.is_empty() && !value.contains("..") && !value.contains('/') && !value.contains('\\')
}

fn try_find_claude_binary_in_path() -> Option<String> {
    #[cfg(windows)]
    let which = "where";
    #[cfg(not(windows))]
    let which = "which";

    let output = std::process::Command::new(which).arg("claude").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let path = stdout.lines().next()?.trim().to_string();
    if path.is_empty() {
        return None;
    }
    if PathBuf::from(&path).exists() {
        Some(path)
    } else {
        None
    }
}

fn try_common_claude_locations() -> Vec<String> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    candidates.push(PathBuf::from("/usr/local/bin/claude"));
    candidates.push(PathBuf::from("/opt/homebrew/bin/claude"));

    if let Ok(home) = home_dir() {
        candidates.push(home.join(".local/bin/claude"));
        candidates.push(home.join(".claude/local/claude"));
        candidates.push(home.join(".nvm/versions/node"));
    }

    let mut found: Vec<String> = Vec::new();
    for c in candidates {
        if c.ends_with("node") {
            if let Ok(entries) = fs::read_dir(&c) {
                for entry in entries.flatten() {
                    let p = entry.path().join("bin/claude");
                    if p.is_file() {
                        found.push(p.to_string_lossy().to_string());
                    }
                }
            }
            continue;
        }

        if c.is_file() {
            found.push(c.to_string_lossy().to_string());
        }
    }

    found
}

fn find_claude_binary(app: &AppHandle) -> Result<String, String> {
    if let Ok(settings) = load_settings(app) {
        if let Some(path) = settings.claude_binary_path {
            if PathBuf::from(&path).is_file() {
                return Ok(path);
            }
        }
    }

    if let Some(path) = try_find_claude_binary_in_path() {
        return Ok(path);
    }

    for candidate in try_common_claude_locations() {
        if PathBuf::from(&candidate).is_file() {
            return Ok(candidate);
        }
    }

    Err("Claude Code not found. Install Claude Code CLI and ensure `claude` is discoverable, or set the binary path in settings.".to_string())
}

#[cfg(not(unix))]
fn create_command_with_env(program: &str) -> Command {
    let mut cmd = Command::new(program);

	for (key, value) in std::env::vars() {
	    if key == "PATH"
	        || key == "HOME"
	        || key == "USER"
	        || key == "SHELL"
	        || key == "TERM"
	        || key == "COLORTERM"
	        || key == "LANG"
	        || key == "LC_ALL"
	        || key.starts_with("LC_")
	        || key == "NODE_PATH"
	        || key == "NVM_DIR"
	        || key == "NVM_BIN"
	        || key == "HOMEBREW_PREFIX"
	        || key == "HOMEBREW_CELLAR"
	    {
	        cmd.env(&key, &value);
	    }
	}

	if std::env::var("TERM").is_err() {
	    cmd.env("TERM", "xterm-256color");
	}

    let current_path = std::env::var("PATH").unwrap_or_default();
    let mut extra_paths: Vec<String> = Vec::new();
    extra_paths.push("/usr/local/bin".to_string());
    extra_paths.push("/opt/homebrew/bin".to_string());
    if let Ok(home) = home_dir() {
        let home_local = home.join(".local/bin");
        extra_paths.push(home_local.to_string_lossy().to_string());
        let claude_local = home.join(".claude/local");
        extra_paths.push(claude_local.to_string_lossy().to_string());
    }
    let mut merged = current_path;
    for p in extra_paths {
        if !merged.split(':').any(|existing| existing == p.as_str()) {
            merged = format!("{p}:{merged}");
        }
    }
    cmd.env("PATH", merged);

    cmd
}

fn kill_pid(pid: u32) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
    }

    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .output();
    }
}

fn sanitize_stream_line(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    for ch in line.chars() {
        if ch == '\t' || (ch >= ' ' && ch != '\u{7f}') {
            out.push(ch);
        }
    }
    out.trim().to_string()
}

fn get_project_path_from_sessions(project_dir: &Path) -> anyhow::Result<String> {
    let entries = fs::read_dir(project_dir).context("Failed to read project directory")?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            let file = fs::File::open(&path).context("Failed to open session jsonl")?;
            let reader = BufReader::new(file);
            for line in reader.lines().take(10).flatten() {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(cwd) = json.get("cwd").and_then(|v| v.as_str()) {
                        if !cwd.is_empty() {
                            return Ok(cwd.to_string());
                        }
                    }
                }
            }
        }
    }

    Err(anyhow::anyhow!(
        "Could not determine project path from session files"
    ))
}

fn decode_project_path_fallback(encoded: &str) -> String {
    encoded.replace('-', "/")
}

fn extract_first_user_message(jsonl_path: &Path) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(jsonl_path) {
        Ok(f) => f,
        Err(_) => return (None, None),
    };
    let reader = BufReader::new(file);
    for line in reader.lines().flatten() {
        let Ok(entry) = serde_json::from_str::<JsonlEntry>(&line) else {
            continue;
        };
        let Some(message) = entry.message else {
            continue;
        };
        if message.role.as_deref() != Some("user") {
            continue;
        }
        let Some(content) = message.content else {
            continue;
        };
        if content.contains("Caveat: The messages below were generated by the user while running local commands") {
            continue;
        }
        if content.starts_with("<command-name>")
            || content.starts_with("<local-command-stdout>")
            || content.starts_with("<local-command-stderr>")
        {
            continue;
        }
        return (Some(content), entry.timestamp);
    }
    (None, None)
}

#[tauri::command]
pub async fn get_claude_binary_path(app: AppHandle) -> Result<Option<String>, String> {
    let settings = load_settings(&app).map_err(|e| e.to_string())?;
    Ok(settings.claude_binary_path)
}

#[tauri::command]
pub async fn set_claude_binary_path(app: AppHandle, path: Option<String>) -> Result<(), String> {
    let mut settings = load_settings(&app).unwrap_or_default();
    settings.claude_binary_path = path.filter(|p| !p.trim().is_empty());
    save_settings(&app, &settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_claude_projects() -> Result<Vec<ClaudeProject>, String> {
    let projects_dir = claude_projects_dir().map_err(|e| e.to_string())?;
    if !projects_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&projects_dir).map_err(|e| e.to_string())?;
    let mut projects: Vec<ClaudeProject> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };

        let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
        let created_at = metadata
            .created()
            .or_else(|_| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
            .duration_since(std::time::SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let project_path = match get_project_path_from_sessions(&path) {
            Ok(p) => p,
            Err(_) => decode_project_path_fallback(dir_name),
        };

        let mut sessions: Vec<String> = Vec::new();
        let mut most_recent_session: Option<u64> = None;
        if let Ok(session_entries) = fs::read_dir(&path) {
            for session_entry in session_entries.flatten() {
                let session_path = session_entry.path();
                if session_path.is_file()
                    && session_path.extension().and_then(|s| s.to_str()) == Some("jsonl")
                {
                    if let Some(session_id) = session_path.file_stem().and_then(|s| s.to_str()) {
                        sessions.push(session_id.to_string());

                        if let Ok(m) = fs::metadata(&session_path) {
                            let modified = m
                                .modified()
                                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();
                            most_recent_session = Some(match most_recent_session {
                                Some(cur) => cur.max(modified),
                                None => modified,
                            });
                        }
                    }
                }
            }
        }

        projects.push(ClaudeProject {
            id: dir_name.to_string(),
            path: project_path,
            sessions,
            created_at,
            most_recent_session,
        });
    }

    projects.sort_by(|a, b| match (a.most_recent_session, b.most_recent_session) {
        (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
        (Some(_), None) => std::cmp::Ordering::Less,
        (None, Some(_)) => std::cmp::Ordering::Greater,
        (None, None) => b.created_at.cmp(&a.created_at),
    });

    Ok(projects)
}

#[tauri::command]
pub async fn list_project_sessions(project_id: String) -> Result<Vec<ClaudeSession>, String> {
    if !looks_like_safe_id(&project_id) {
        return Err("Invalid project_id".to_string());
    }

    let projects_dir = claude_projects_dir().map_err(|e| e.to_string())?;
    let project_dir = projects_dir.join(&project_id);
    if !project_dir.exists() {
        return Err(format!("Project directory not found: {}", project_id));
    }

    let project_path = match get_project_path_from_sessions(&project_dir) {
        Ok(p) => p,
        Err(_) => decode_project_path_fallback(&project_id),
    };

    let entries = fs::read_dir(&project_dir).map_err(|e| e.to_string())?;
    let mut sessions: Vec<ClaudeSession> = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("jsonl") {
            let Some(session_id) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };

            let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
            let created_at = metadata
                .created()
                .or_else(|_| metadata.modified())
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            let modified_at = metadata
                .modified()
                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();

            let (first_message, message_timestamp) = extract_first_user_message(&path);

            sessions.push(ClaudeSession {
                id: session_id.to_string(),
                project_id: project_id.clone(),
                project_path: project_path.clone(),
                created_at,
                modified_at,
                first_message,
                message_timestamp,
            });
        }
    }

    // Sort by most recently updated (descending) so continued sessions float to the top.
    sessions.sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then_with(|| b.created_at.cmp(&a.created_at)));
    Ok(sessions)
}

#[tauri::command]
pub async fn get_session_jsonl(
    project_id: String,
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    if !looks_like_safe_id(&project_id) {
        return Err("Invalid project_id".to_string());
    }
    if !looks_like_safe_id(&session_id) {
        return Err("Invalid session_id".to_string());
    }

    let projects_dir = claude_projects_dir().map_err(|e| e.to_string())?;
    let session_path = projects_dir
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    let file = fs::File::open(&session_path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);
    let mut messages: Vec<serde_json::Value> = Vec::new();
    for line in reader.lines().flatten() {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
            messages.push(json);
        }
    }
    Ok(messages)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeExecuteParams {
    pub project_path: String,
    pub prompt: String,
    pub model: String,
    pub skip_permissions: bool,
}

fn build_claude_args(prompt: &str, model: &str, skip_permissions: bool) -> Vec<String> {
    let mut args = vec![
        "-p".to_string(),
        prompt.to_string(),
        "--model".to_string(),
        model.to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--include-partial-messages".to_string(),
        "--verbose".to_string(),
    ];
    if skip_permissions {
        args.push("--dangerously-skip-permissions".to_string());
    }
    args
}

#[cfg(unix)]
fn spawn_claude_process_pty(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::io::Read;
    use std::time::{Duration, Instant};

    let state = app.state::<ClaudeCodeProcessState>();
    {
        let mut guard = state.current_pid.lock().unwrap();
        if let Some(existing) = guard.take() {
            kill_pid(existing);
        }
    }

    log::info!(
        "[claude_code] spawning (pty) program={} cwd={} args_count={}",
        program,
        cwd,
        args.len()
    );

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 120,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to open PTY: {e}"))?;

    let mut builder = CommandBuilder::new(program);
    for arg in args {
        builder.arg(arg);
    }
    builder.cwd(cwd);

    // Basic env, plus TERM to make the CLI behave like an interactive terminal (unbuffered).
    for (key, value) in std::env::vars() {
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "TERM"
            || key == "COLORTERM"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
        {
            builder.env(key, value);
        }
    }
    if std::env::var("TERM").is_err() {
        builder.env("TERM", "xterm-256color");
    }

    let mut child = pair
        .slave
        .spawn_command(builder)
        .map_err(|e| format!("Failed to spawn claude (PTY): {e}"))?;

    let pid = child
        .process_id()
        .ok_or_else(|| "Failed to determine claude PID".to_string())?;
    {
        let mut guard = state.current_pid.lock().unwrap();
        *guard = Some(pid);
    }
    log::info!("[claude_code] spawned (pty) pid={pid}");

    let session_id_holder: Arc<std::sync::Mutex<Option<String>>> =
        Arc::new(std::sync::Mutex::new(None));

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to clone PTY reader: {e}"))?;

    let app_out = app.clone();
    let sid_out = session_id_holder.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut acc: Vec<u8> = Vec::new();
        let mut total_bytes: usize = 0;
        let mut total_lines: usize = 0;
        let started_at = Instant::now();
        let mut last_progress = Instant::now();

        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    total_bytes += n;
                    if total_bytes == n {
                        log::info!(
                            "[claude_code] first bytes received (pty) pid={pid} bytes={n} after_ms={}",
                            started_at.elapsed().as_millis()
                        );
                    }
                    if last_progress.elapsed() >= Duration::from_secs(2) {
                        log::info!(
                            "[claude_code] streaming progress (pty) pid={pid} bytes={} lines={} elapsed_ms={}",
                            total_bytes,
                            total_lines,
                            started_at.elapsed().as_millis()
                        );
                        last_progress = Instant::now();
                    }

                    acc.extend_from_slice(&buf[..n]);
                    while let Some(pos) = acc.iter().position(|b| *b == b'\n' || *b == b'\r') {
                        let mut line = acc.drain(..=pos).collect::<Vec<u8>>();
                        while matches!(line.last(), Some(b'\n' | b'\r')) {
                            line.pop();
                        }
                        let raw = String::from_utf8_lossy(&line).to_string();
                        let clean = sanitize_stream_line(&raw);
                        if clean.is_empty() {
                            continue;
                        }

                        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&clean) {
                            if msg.get("type").and_then(|v| v.as_str()) == Some("system")
                                && msg.get("subtype").and_then(|v| v.as_str()) == Some("init")
                            {
                                if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
                                    let mut guard = sid_out.lock().unwrap();
                                    if guard.is_none() {
                                        *guard = Some(sid.to_string());
                                        log::info!(
                                            "[claude_code] system:init (pty) pid={pid} session_id={sid}"
                                        );
                                    }
                                }
                            }
                        }

                        total_lines += 1;
                        let _ = app_out.emit("claude-output", &clean);
                        if let Some(ref sid) = *sid_out.lock().unwrap() {
                            let _ = app_out.emit(&format!("claude-output:{sid}"), &clean);
                        }
                    }
                }
                Err(e) => {
                    log::info!("[claude_code] pty read error pid={pid} err={e}");
                    break;
                }
            }
        }

        log::info!(
            "[claude_code] pty reader finished pid={pid} bytes={} lines={} elapsed_ms={}",
            total_bytes,
            total_lines,
            started_at.elapsed().as_millis()
        );
    });

    let app_wait = app.clone();
    let sid_wait = session_id_holder.clone();
    let pid_wait = pid;
    std::thread::spawn(move || {
        let ok = child.wait().map(|s| s.success()).unwrap_or(false);
        let state = app_wait.state::<ClaudeCodeProcessState>();
        {
            let mut guard = state.current_pid.lock().unwrap();
            if guard.as_ref() == Some(&pid_wait) {
                *guard = None;
            }
        }
        if let Some(ref sid) = *sid_wait.lock().unwrap() {
            let _ = app_wait.emit(&format!("claude-complete:{sid}"), ok);
        }
        let _ = app_wait.emit("claude-complete", ok);
        log::info!("[claude_code] process exited (pty) pid={pid_wait} ok={ok}");
    });

    Ok(())
}

#[cfg(not(unix))]
async fn spawn_claude_process_pipe(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};

    let mut cmd = create_command_with_env(&program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.current_dir(&cwd).stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn claude: {e}"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let session_id_holder: Arc<std::sync::Mutex<Option<String>>> =
        Arc::new(std::sync::Mutex::new(None));

    let pid = child.id().unwrap_or(0);
    let state = app.state::<ClaudeCodeProcessState>();
    {
        let mut guard = state.current_pid.lock().unwrap();
        if let Some(existing) = guard.take() {
            kill_pid(existing);
        }
        *guard = Some(pid);
    }

    let stdout_reader = TokioBufReader::new(stdout);
    let stderr_reader = TokioBufReader::new(stderr);

    let app_stdout = app.clone();
    let session_id_holder_stdout = session_id_holder.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let clean = sanitize_stream_line(&line);
            if clean.is_empty() {
                continue;
            }
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&clean) {
                if msg.get("type").and_then(|v| v.as_str()) == Some("system")
                    && msg.get("subtype").and_then(|v| v.as_str()) == Some("init")
                {
                    if let Some(sid) = msg.get("session_id").and_then(|v| v.as_str()) {
                        let mut guard = session_id_holder_stdout.lock().unwrap();
                        if guard.is_none() {
                            *guard = Some(sid.to_string());
                        }
                    }
                }
            }

            let _ = app_stdout.emit("claude-output", &clean);
            if let Some(ref sid) = *session_id_holder_stdout.lock().unwrap() {
                let _ = app_stdout.emit(&format!("claude-output:{sid}"), &clean);
            }
        }
    });

    let app_stderr = app.clone();
    let session_id_holder_stderr = session_id_holder.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let clean = sanitize_stream_line(&line);
            if clean.is_empty() {
                continue;
            }
            let _ = app_stderr.emit("claude-error", &clean);
            if let Some(ref sid) = *session_id_holder_stderr.lock().unwrap() {
                let _ = app_stderr.emit(&format!("claude-error:{sid}"), &clean);
            }
        }
    });

    let app_wait = app.clone();
    let session_id_holder_wait = session_id_holder.clone();
    let state_wait = state.current_pid.clone();
    let pid_wait = pid;
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let ok = child.wait().await.map(|s| s.success()).unwrap_or(false);
        {
            let mut guard = state_wait.lock().unwrap();
            if guard.as_ref() == Some(&pid_wait) {
                *guard = None;
            }
        }
        if let Some(ref sid) = *session_id_holder_wait.lock().unwrap() {
            let _ = app_wait.emit(&format!("claude-complete:{sid}"), ok);
        }
        let _ = app_wait.emit("claude-complete", ok);
    });

    Ok(())
}

async fn spawn_claude_process(
    app: AppHandle,
    program: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    #[cfg(unix)]
    {
        spawn_claude_process_pty(app, program, args, cwd)
    }

    #[cfg(not(unix))]
    {
        spawn_claude_process_pipe(app, program, args, cwd).await
    }
}

#[tauri::command]
pub async fn execute_claude_code(app: AppHandle, params: ClaudeExecuteParams) -> Result<(), String> {
    let claude = find_claude_binary(&app)?;
    let args = build_claude_args(&params.prompt, &params.model, params.skip_permissions);
    spawn_claude_process(app, claude, args, params.project_path).await
}

#[tauri::command]
pub async fn continue_claude_code(
    app: AppHandle,
    params: ClaudeExecuteParams,
) -> Result<(), String> {
    let claude = find_claude_binary(&app)?;
    let mut args = vec!["-c".to_string()];
    args.extend(build_claude_args(
        &params.prompt,
        &params.model,
        params.skip_permissions,
    ));
    spawn_claude_process(app, claude, args, params.project_path).await
}

#[tauri::command]
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,
    prompt: String,
    model: String,
    skip_permissions: bool,
) -> Result<(), String> {
    let claude = find_claude_binary(&app)?;
    let mut args = vec!["--resume".to_string(), session_id];
    args.extend(build_claude_args(&prompt, &model, skip_permissions));
    spawn_claude_process(app, claude, args, project_path).await
}

#[tauri::command]
pub async fn cancel_claude_execution(app: AppHandle) -> Result<(), String> {
    let state = app.state::<ClaudeCodeProcessState>();
    if let Some(pid) = state.current_pid.lock().unwrap().take() {
        kill_pid(pid);
    }

    let _ = app.emit("claude-cancelled", true);
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let _ = app.emit("claude-complete", false);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_id_rejects_path_traversal() {
        assert!(!looks_like_safe_id(""));
        assert!(!looks_like_safe_id("../x"));
        assert!(!looks_like_safe_id("a/../b"));
        assert!(!looks_like_safe_id("a/b"));
        assert!(!looks_like_safe_id("a\\b"));
        assert!(looks_like_safe_id("abc-123_DEF"));
    }

    #[test]
    fn first_user_message_ignores_boilerplate() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("s.jsonl");
        fs::write(
            &file,
            r#"
{"message":{"role":"user","content":"Caveat: The messages below were generated by the user while running local commands"},"timestamp":"t1"}
{"message":{"role":"user","content":"<command-name>ls</command-name>"},"timestamp":"t2"}
{"message":{"role":"user","content":"hello"},"timestamp":"t3"}
"#,
        )
        .unwrap();

        let (msg, ts) = extract_first_user_message(&file);
        assert_eq!(msg.as_deref(), Some("hello"));
        assert_eq!(ts.as_deref(), Some("t3"));
    }
}
