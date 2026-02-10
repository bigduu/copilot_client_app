use async_trait::async_trait;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, ChildStdout, Command};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use crate::config::StdioConfig;
use crate::error::{McpError, Result};
use crate::protocol::client::McpTransport;

pub struct StdioTransport {
    config: StdioConfig,
    child: Option<Child>,
    stdin: Option<Arc<Mutex<ChildStdin>>>,
    stdout: Option<Arc<Mutex<BufReader<ChildStdout>>>>,
}

use std::sync::Arc;

impl StdioTransport {
    pub fn new(config: StdioConfig) -> Self {
        Self {
            config,
            child: None,
            stdin: None,
            stdout: None,
        }
    }
}

#[async_trait]
impl McpTransport for StdioTransport {
    async fn connect(&mut self) -> Result<()> {
        info!(
            "Starting MCP server process: {} {:?}",
            self.config.command, self.config.args
        );

        let mut cmd = Command::new(&self.config.command);
        cmd.args(&self.config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        if let Some(cwd) = &self.config.cwd {
            cmd.current_dir(cwd);
        }

        if !self.config.env.is_empty() {
            cmd.envs(&self.config.env);
        }

        let mut child = cmd.spawn().map_err(|e| {
            error!("Failed to spawn MCP server process: {}", e);
            McpError::Transport(format!("Failed to spawn process: {}", e))
        })?;

        // Get stdin/stdout
        let stdin = child.stdin.take().ok_or_else(|| {
            McpError::Transport("Failed to capture stdin".to_string())
        })?;

        let stdout = child.stdout.take().ok_or_else(|| {
            McpError::Transport("Failed to capture stdout".to_string())
        })?;

        // Start stderr logger
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    debug!("[MCP server stderr] {}", line);
                }
            });
        }

        self.child = Some(child);
        self.stdin = Some(Arc::new(Mutex::new(stdin)));
        self.stdout = Some(Arc::new(Mutex::new(BufReader::new(stdout))));

        info!("MCP server process started successfully");
        Ok(())
    }

    async fn disconnect(&mut self) -> Result<()> {
        info!("Disconnecting MCP server process");

        // Close stdin to signal EOF
        self.stdin = None;
        self.stdout = None;

        if let Some(mut child) = self.child.take() {
            // Try graceful shutdown
            match tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                child.wait(),
            )
            .await
            {
                Ok(Ok(_)) => {
                    info!("MCP server process exited gracefully");
                }
                _ => {
                    warn!("MCP server process did not exit gracefully, killing");
                    let _ = child.kill().await;
                }
            }
        }

        Ok(())
    }

    async fn send(&self, message: String) -> Result<()> {
        let stdin = self.stdin.as_ref().ok_or_else(|| {
            McpError::Disconnected
        })?;

        let mut stdin = stdin.lock().await;
        let message_with_newline = format!("{}\n", message);
        stdin
            .write_all(message_with_newline.as_bytes())
            .await
            .map_err(|e| McpError::Transport(format!("Failed to write: {}", e)))?;
        stdin.flush().await.map_err(|e| {
            McpError::Transport(format!("Failed to flush: {}", e))
        })?;

        debug!("Sent: {}", message);
        Ok(())
    }

    async fn receive(&self) -> Result<Option<String>> {
        let stdout = self.stdout.as_ref().ok_or_else(|| {
            McpError::Disconnected
        })?;

        let mut stdout = stdout.lock().await;
        let mut line = String::new();

        match tokio::time::timeout(
            tokio::time::Duration::from_millis(100),
            stdout.read_line(&mut line),
        )
        .await
        {
            Ok(Ok(0)) => {
                // EOF
                warn!("MCP server stdout closed (EOF)");
                Err(McpError::Disconnected)
            }
            Ok(Ok(_)) => {
                let line = line.trim();
                if line.is_empty() {
                    Ok(None)
                } else {
                    debug!("Received: {}", line);
                    Ok(Some(line.to_string()))
                }
            }
            Ok(Err(e)) => Err(McpError::Transport(format!(
                "Failed to read: {}",
                e
            ))),
            Err(_) => {
                // Timeout, no data available
                Ok(None)
            }
        }
    }

    fn is_connected(&self) -> bool {
        // Note: is_connected is called on &self, but try_wait needs &mut self
        // We use a simple check - if we have a child handle, assume connected
        // Actual process exit will be detected during receive()
        self.child.is_some()
    }
}
