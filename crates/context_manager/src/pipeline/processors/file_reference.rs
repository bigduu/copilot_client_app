//! File Reference Processor
//!
//! This processor detects and resolves file references in messages.

use crate::pipeline::context::{FileContent, ProcessingContext, PromptFragment};
use crate::pipeline::error::ProcessError;
use crate::pipeline::result::ProcessResult;
use crate::pipeline::traits::MessageProcessor;
use crate::structs::message_types::RichMessageType;
use regex::Regex;
use std::fs;
use std::path::{Path, PathBuf};

/// File Reference Processor
///
/// Detects file references in messages (e.g., `@file.rs`, `@file.rs:10-20`)
/// and reads the file content.
///
/// # File Reference Syntax
///
/// - `@path/to/file.rs` - Entire file
/// - `@path/to/file.rs:10-20` - Lines 10 to 20
/// - `@path/to/file.rs:10` - Line 10 only
///
/// # Example
///
/// ```no_run
/// use context_manager::pipeline::processors::FileReferenceProcessor;
/// use context_manager::pipeline::MessagePipeline;
///
/// let processor = FileReferenceProcessor::new("/workspace/root");
/// let pipeline = MessagePipeline::new()
///     .register(Box::new(processor));
/// ```
pub struct FileReferenceProcessor {
    config: FileReferenceConfig,
    file_ref_pattern: Regex,
}

/// File Reference Configuration
#[derive(Debug, Clone)]
pub struct FileReferenceConfig {
    /// Workspace root path (all file references are relative to this)
    pub workspace_root: PathBuf,

    /// Maximum file size in bytes (0 = no limit)
    pub max_file_size: usize,

    /// Allowed file extensions (empty = all allowed)
    pub allowed_extensions: Vec<String>,

    /// Generate summary for large files
    pub generate_summary: bool,

    /// Summary threshold in lines
    pub summary_threshold_lines: usize,
}

impl Default for FileReferenceConfig {
    fn default() -> Self {
        Self {
            workspace_root: PathBuf::from("."),
            max_file_size: 1024 * 1024, // 1MB
            allowed_extensions: Vec::new(),
            generate_summary: false,
            summary_threshold_lines: 1000,
        }
    }
}

impl FileReferenceProcessor {
    /// Create a new file reference processor
    pub fn new<P: AsRef<Path>>(workspace_root: P) -> Self {
        let config = FileReferenceConfig {
            workspace_root: workspace_root.as_ref().to_path_buf(),
            ..Default::default()
        };

        // Compile regex for file references
        // Matches: @path/to/file.ext or @path/to/file.ext:10-20 or @path/to/file.ext:10
        let pattern = r"@([a-zA-Z0-9_/\.\-]+)(?::(\d+)(?:-(\d+))?)?";
        let file_ref_pattern = Regex::new(pattern).expect("Failed to compile file ref regex");

        Self {
            config,
            file_ref_pattern,
        }
    }

    /// Create with custom configuration
    pub fn with_config(config: FileReferenceConfig) -> Self {
        let pattern = r"@([a-zA-Z0-9_/\.\-]+)(?::(\d+)(?:-(\d+))?)?";
        let file_ref_pattern = Regex::new(pattern).expect("Failed to compile file ref regex");

        Self {
            config,
            file_ref_pattern,
        }
    }

    /// Extract file references from text
    fn extract_file_refs(&self, text: &str) -> Vec<FileRef> {
        let mut refs = Vec::new();

        for cap in self.file_ref_pattern.captures_iter(text) {
            let path = cap.get(1).unwrap().as_str();
            let start_line = cap.get(2).and_then(|m| m.as_str().parse::<usize>().ok());
            let end_line = cap.get(3).and_then(|m| m.as_str().parse::<usize>().ok());

            refs.push(FileRef {
                path: path.to_string(),
                start_line,
                end_line,
            });
        }

        refs
    }

    /// Read file content
    fn read_file(&self, file_ref: &FileRef) -> Result<FileContent, ProcessError> {
        let full_path = self.config.workspace_root.join(&file_ref.path);

        // Check if file exists
        if !full_path.exists() {
            return Err(ProcessError::FileNotFound(file_ref.path.clone()));
        }

        // Check file extension
        if !self.config.allowed_extensions.is_empty() {
            if let Some(ext) = full_path.extension() {
                let ext_str = ext.to_string_lossy().to_string();
                if !self.config.allowed_extensions.contains(&ext_str) {
                    return Err(ProcessError::PermissionDenied(format!(
                        "File extension '{}' not allowed",
                        ext_str
                    )));
                }
            }
        }

        // Check file size
        let metadata = fs::metadata(&full_path)?;
        let size = metadata.len() as usize;

        if self.config.max_file_size > 0 && size > self.config.max_file_size {
            return Err(ProcessError::FileTooLarge {
                path: file_ref.path.clone(),
                size,
                max: self.config.max_file_size,
            });
        }

        // Read file content
        let content = fs::read_to_string(&full_path).map_err(|e| ProcessError::FileError(e))?;

        // Extract line range if specified
        let (final_content, start_line, end_line) = if let Some(start) = file_ref.start_line {
            let lines: Vec<&str> = content.lines().collect();
            let end = file_ref.end_line.unwrap_or(start);

            // Validate line range
            if start == 0 || start > lines.len() {
                return Err(ProcessError::InvalidFormat(format!(
                    "Invalid line number: {}",
                    start
                )));
            }

            let start_idx = start - 1; // Convert to 0-based
            let end_idx = std::cmp::min(end, lines.len());

            let range_content = lines[start_idx..end_idx].join("\n");
            (range_content, Some(start), Some(end_idx))
        } else {
            (content, None, None)
        };

        // Detect MIME type (simplified)
        let mime_type = match full_path.extension().and_then(|e| e.to_str()) {
            Some("rs") => Some("text/x-rust".to_string()),
            Some("ts") | Some("tsx") => Some("text/typescript".to_string()),
            Some("js") | Some("jsx") => Some("text/javascript".to_string()),
            Some("md") => Some("text/markdown".to_string()),
            Some("json") => Some("application/json".to_string()),
            _ => None,
        };

        Ok(FileContent {
            path: full_path,
            content: final_content,
            start_line,
            end_line,
            size_bytes: size,
            mime_type,
        })
    }
}

impl MessageProcessor for FileReferenceProcessor {
    fn name(&self) -> &str {
        "file_reference"
    }

    fn process<'a>(&self, ctx: &mut ProcessingContext<'a>) -> Result<ProcessResult, ProcessError> {
        // Only process text messages
        let text_content = if let Some(RichMessageType::Text(text_msg)) = &ctx.message.rich_type {
            &text_msg.content
        } else {
            // For legacy messages, check content parts
            return Ok(ProcessResult::Continue);
        };

        // Extract file references
        let file_refs = self.extract_file_refs(text_content);

        if file_refs.is_empty() {
            return Ok(ProcessResult::Continue);
        }

        // Read all referenced files
        for file_ref in file_refs {
            match self.read_file(&file_ref) {
                Ok(file_content) => {
                    // Add file content to context
                    ctx.add_file_content(file_content.clone());

                    // Add prompt fragment with file context
                    let fragment = PromptFragment {
                        content: format!(
                            "\n## File Context: {}\n\n```\n{}\n```\n",
                            file_content.path.display(),
                            file_content.content
                        ),
                        source: "file_reference".to_string(),
                        priority: 70, // High priority
                    };
                    ctx.add_prompt_fragment(fragment);
                }
                Err(e) => {
                    // Log error but continue processing
                    log::warn!("Failed to read file {}: {}", file_ref.path, e);
                    // Optionally abort on file read errors
                    // return Err(e);
                }
            }
        }

        Ok(ProcessResult::Continue)
    }

    fn should_run<'a>(&self, ctx: &ProcessingContext<'a>) -> bool {
        // Only run on text messages
        matches!(
            ctx.message.rich_type,
            Some(RichMessageType::Text(_))
        )
    }
}

/// File Reference
#[derive(Debug, Clone)]
struct FileRef {
    path: String,
    start_line: Option<usize>,
    end_line: Option<usize>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::structs::context::ChatContext;
    use crate::structs::message::{InternalMessage, Role};
    use crate::structs::message_types::{RichMessageType, TextMessage};
    use std::fs;
    use tempfile::TempDir;
    use uuid::Uuid;

    fn create_test_context() -> ChatContext {
        ChatContext::new(Uuid::new_v4(), "test-model".to_string(), "test-mode".to_string())
    }

    fn create_test_message(content: &str) -> InternalMessage {
        InternalMessage {
            role: Role::User,
            content: Vec::new(),
            tool_calls: None,
            tool_result: None,
            metadata: None,
            message_type: Default::default(),
            rich_type: Some(RichMessageType::Text(TextMessage::new(content))),
        }
    }

    #[test]
    fn test_extract_file_refs() {
        let processor = FileReferenceProcessor::new(".");
        let text = "Check @src/main.rs and @lib/utils.ts:10-20";
        let refs = processor.extract_file_refs(text);

        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].path, "src/main.rs");
        assert_eq!(refs[0].start_line, None);
        assert_eq!(refs[1].path, "lib/utils.ts");
        assert_eq!(refs[1].start_line, Some(10));
        assert_eq!(refs[1].end_line, Some(20));
    }

    #[test]
    fn test_read_file() {
        // Create temporary file
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Line 1\nLine 2\nLine 3\n").unwrap();

        let processor = FileReferenceProcessor::new(temp_dir.path());
        let file_ref = FileRef {
            path: "test.txt".to_string(),
            start_line: None,
            end_line: None,
        };

        let result = processor.read_file(&file_ref);
        assert!(result.is_ok());

        let content = result.unwrap();
        assert_eq!(content.content, "Line 1\nLine 2\nLine 3\n");
    }

    #[test]
    fn test_read_file_with_line_range() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Line 1\nLine 2\nLine 3\nLine 4\n").unwrap();

        let processor = FileReferenceProcessor::new(temp_dir.path());
        let file_ref = FileRef {
            path: "test.txt".to_string(),
            start_line: Some(2),
            end_line: Some(3),
        };

        let result = processor.read_file(&file_ref);
        assert!(result.is_ok());

        let content = result.unwrap();
        assert_eq!(content.content, "Line 2\nLine 3");
        assert_eq!(content.start_line, Some(2));
        assert_eq!(content.end_line, Some(3));
    }

    #[test]
    fn test_file_not_found() {
        let processor = FileReferenceProcessor::new(".");
        let file_ref = FileRef {
            path: "nonexistent.txt".to_string(),
            start_line: None,
            end_line: None,
        };

        let result = processor.read_file(&file_ref);
        assert!(matches!(result, Err(ProcessError::FileNotFound(_))));
    }

    #[test]
    fn test_process_message_with_file_refs() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.rs");
        fs::write(&file_path, "fn main() {}").unwrap();

        let processor = FileReferenceProcessor::new(temp_dir.path());
        let message = create_test_message("Check @test.rs");
        let mut context = create_test_context();
        let mut ctx = ProcessingContext::new(message, &mut context);

        let result = processor.process(&mut ctx);
        assert!(result.is_ok());
        assert_eq!(ctx.file_contents.len(), 1);
        assert_eq!(ctx.prompt_fragments.len(), 1);
    }
}

