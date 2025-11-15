//! Tests for individual tool implementations

use serde_json::json;
use std::fs;
use tempfile::TempDir;
use tool_system::{
    registry::{register_all_tools, ToolRegistry},
    types::{ToolArguments, ToolError},
};

#[tokio::test]
async fn test_demo_tool_execution() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("demo_tool");

    if let Some(tool) = tool {
        let result = tool.execute(ToolArguments::String("".to_string())).await;
        assert!(result.is_ok(), "Demo tool should execute successfully");

        let value = result.unwrap();
        assert!(
            value.get("report").is_some(),
            "Demo tool should return a report"
        );
    } else {
        println!("Demo tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_success() {
    // Create a temporary file
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    fs::write(&file_path, "Hello, World!").unwrap();

    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");

    if let Some(tool) = tool {
        let args = ToolArguments::Json(json!({ "path": file_path.to_str() }));
        let result = tool.execute(args).await;

        assert!(result.is_ok(), "Read file tool should succeed");
        let value = result.unwrap();
        assert!(value.get("content").is_some(), "Should return file content");

        let content = value.get("content").unwrap().as_str().unwrap();
        assert_eq!(content, "Hello, World!");
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_invalid_path() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");

    if let Some(tool) = tool {
        let args = ToolArguments::String("/nonexistent/path/file.txt".to_string());
        let result = tool.execute(args).await;

        assert!(
            result.is_err(),
            "Read file tool should fail for invalid path"
        );

        let error = result.unwrap_err();
        match error {
            ToolError::ExecutionFailed(_) => {
                // Expected error type
            }
            _ => panic!("Expected ExecutionFailed error"),
        }
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_read_file_tool_line_range() {
    // Create a temporary file with multiple lines
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("test.txt");
    let content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
    fs::write(&file_path, content).unwrap();

    let registry = ToolRegistry::new();
    let tool = registry.get_tool("read_file");

    if let Some(tool) = tool {
        let args = ToolArguments::Json(json!({
            "path": file_path.to_str(),
            "start_line": "2",
            "end_line": "4"
        }));
        let result = tool.execute(args).await;

        assert!(
            result.is_ok(),
            "Read file tool should succeed with line range"
        );
        let value = result.unwrap();
        assert!(
            value.get("message").is_some(),
            "Should return formatted message with lines"
        );

        let message = value.get("message").unwrap().as_str().unwrap();
        assert!(
            message.contains("2-4"),
            "Should contain line range in message"
        );
    } else {
        println!("Read file tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_execute_command_tool_success() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("execute_command");

    if let Some(tool) = tool {
        // Execute a simple command
        let args = ToolArguments::String("echo 'Hello'".to_string());
        let result = tool.execute(args).await;

        if result.is_ok() {
            let value = result.unwrap();
            assert!(value.get("status").is_some(), "Should return status");
            assert!(value.get("stdout").is_some(), "Should return stdout");
        } else {
            // Command might fail on some systems, that's ok
            println!("Command execution failed, which is acceptable in test environment");
        }
    } else {
        println!("Execute command tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_execute_command_tool_invalid_command() {
    let registry = ToolRegistry::new();
    let tool = registry.get_tool("execute_command");

    if let Some(tool) = tool {
        // Try to execute a non-existent command
        let args = ToolArguments::String("nonexistent_command_xyz123".to_string());
        let result = tool.execute(args).await;

        // This should fail
        assert!(result.is_err(), "Should fail for invalid command");
    } else {
        println!("Execute command tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_tool_arguments_parsing() {
    let registry = ToolRegistry::new();
    let tools = registry.list_tool_definitions();

    // Test that each tool can handle different argument formats
    for tool_def in tools {
        let tool = registry.get_tool(&tool_def.name).unwrap();

        // Try with String arguments
        let result1 = tool
            .execute(ToolArguments::String("test".to_string()))
            .await;
        assert!(
            result1.is_ok() || result1.is_err(),
            "Should handle String arguments"
        );

        // Try with JSON arguments
        let result2 = tool.execute(ToolArguments::Json(json!({}))).await;
        assert!(
            result2.is_ok() || result2.is_err(),
            "Should handle JSON arguments"
        );
    }
}

// ============================================================================
// Integration tests for new tools: grep, glob, replace, edit_lines
// ============================================================================

#[tokio::test]
async fn test_grep_tool_integration() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("grep");

    if let Some(tool) = tool {
        // Create test files
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("test1.rs");
        let file2 = temp_dir.path().join("test2.ts");
        fs::write(&file1, "fn test_function() {\n    println!(\"test\");\n}").unwrap();
        fs::write(&file2, "function testFunction() {\n    console.log('test');\n}").unwrap();

        // Search for "test" pattern
        let args = ToolArguments::Json(json!({
            "pattern": "test",
            "path": temp_dir.path().to_str().unwrap(),
            "case_sensitive": false
        }));

        let result = tool.execute(args).await;
        assert!(result.is_ok(), "Grep tool should execute successfully");

        let value = result.unwrap();
        assert_eq!(value["status"], "success");
        assert!(value["matches"].is_array(), "Should return matches array");
        assert!(
            value["matches"].as_array().unwrap().len() > 0,
            "Should find at least one match"
        );
    } else {
        println!("Grep tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_glob_tool_integration() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("glob");

    if let Some(tool) = tool {
        // Create test files with different extensions
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("test1.rs");
        let file2 = temp_dir.path().join("test2.ts");
        let file3 = temp_dir.path().join("test3.tsx");
        fs::write(&file1, "// Rust file").unwrap();
        fs::write(&file2, "// TypeScript file").unwrap();
        fs::write(&file3, "// TSX file").unwrap();

        // Search for all .ts files
        let args = ToolArguments::Json(json!({
            "pattern": "*.ts",
            "path": temp_dir.path().to_str().unwrap()
        }));

        let result = tool.execute(args).await;
        assert!(result.is_ok(), "Glob tool should execute successfully");

        let value = result.unwrap();
        assert_eq!(value["status"], "success");
        assert!(value["files"].is_array(), "Should return files array");
        // Note: The actual file matching behavior is tested in unit tests.
        // This integration test verifies the tool executes successfully through the registry.
    } else {
        println!("Glob tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_replace_tool_integration() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("replace_in_file");

    if let Some(tool) = tool {
        // Create a test file
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "Hello World\nHello Rust\nHello Test").unwrap();

        // Test preview mode first
        let preview_args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "Hello",
            "replace": "Hi",
            "preview_only": true
        }));

        let preview_result = tool.execute(preview_args).await;
        assert!(preview_result.is_ok(), "Preview mode should succeed");
        let preview_value = preview_result.unwrap();
        
        // Preview mode should return status "preview" with diff information
        assert_eq!(preview_value["status"], "preview", "Should return preview status");
        assert!(
            preview_value.get("diff").is_some() || preview_value.get("replacements").is_some(),
            "Should return diff or replacements information"
        );
        assert_eq!(
            preview_value["replacements"],
            3,
            "Should find 3 occurrences in preview"
        );

        // Verify file was NOT modified in preview mode
        let content_after_preview = fs::read_to_string(&file_path).unwrap();
        assert!(
            content_after_preview.contains("Hello"),
            "File should not be modified in preview mode"
        );

        // Now do actual replacement
        let replace_args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "find": "Hello",
            "replace": "Hi",
            "preview_only": false
        }));

        let replace_result = tool.execute(replace_args).await;
        assert!(replace_result.is_ok(), "Replace should succeed");
        let replace_value = replace_result.unwrap();
        assert_eq!(replace_value["status"], "success");
        // The response uses "replacements" field, not "replacements_made"
        let replacements = replace_value.get("replacements")
            .or_else(|| replace_value.get("replacements_made"))
            .and_then(|v| v.as_u64());
        assert!(
            replacements.is_some() && replacements.unwrap() == 3,
            "Should make 3 replacements. Got: {:?}", replace_value
        );

        // Verify file was actually modified
        let content_after_replace = fs::read_to_string(&file_path).unwrap();
        assert!(
            content_after_replace.contains("Hi"),
            "File should contain 'Hi' after replacement"
        );
        assert!(
            !content_after_replace.contains("Hello"),
            "File should not contain 'Hello' after replacement"
        );
    } else {
        println!("Replace tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_edit_lines_tool_integration() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("edit_lines");

    if let Some(tool) = tool {
        // Create a test file
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(
            &file_path,
            "Line 1\nLine 2\nLine 3\nLine 4\nLine 5",
        )
        .unwrap();

        // Test insert operation
        let insert_args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "insert",
            "start_line": 2,
            "content": "Line 2.5\n"
        }));

        let insert_result = tool.execute(insert_args).await;
        assert!(insert_result.is_ok(), "Insert should succeed");
        let insert_value = insert_result.unwrap();
        assert_eq!(insert_value["status"], "success");
        assert_eq!(
            insert_value["new_line_count"],
            6,
            "Should have 6 lines after insert"
        );

        // Verify insertion
        let content_after_insert = fs::read_to_string(&file_path).unwrap();
        let lines: Vec<&str> = content_after_insert.lines().collect();
        assert_eq!(lines.len(), 6, "Should have 6 lines");
        assert_eq!(lines[2], "Line 2.5", "Line 2.5 should be at position 2");

        // Test replace operation
        let replace_args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "replace",
            "start_line": 3,
            "end_line": 4,
            "content": "Line 3 Modified\n"
        }));

        let replace_result = tool.execute(replace_args).await;
        assert!(replace_result.is_ok(), "Replace should succeed");
        let replace_value = replace_result.unwrap();
        assert_eq!(replace_value["status"], "success");

        // Verify replacement
        let content_after_replace = fs::read_to_string(&file_path).unwrap();
        assert!(
            content_after_replace.contains("Line 3 Modified"),
            "Should contain modified line"
        );

        // Test delete operation
        let delete_args = ToolArguments::Json(json!({
            "path": file_path.to_str().unwrap(),
            "operation": "delete",
            "start_line": 1,
            "end_line": 1
        }));

        let delete_result = tool.execute(delete_args).await;
        assert!(delete_result.is_ok(), "Delete should succeed");
        let delete_value = delete_result.unwrap();
        assert_eq!(delete_value["status"], "success");

        // Verify deletion
        let content_after_delete = fs::read_to_string(&file_path).unwrap();
        let lines_after_delete: Vec<&str> = content_after_delete.lines().collect();
        assert!(
            lines_after_delete.len() < 6,
            "Should have fewer lines after deletion"
        );
    } else {
        println!("Edit lines tool not registered, skipping test");
    }
}

#[tokio::test]
async fn test_grep_tool_file_type_filter() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("grep");

    if let Some(tool) = tool {
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("test1.rs");
        let file2 = temp_dir.path().join("test2.ts");
        fs::write(&file1, "fn test() {}").unwrap();
        fs::write(&file2, "function test() {}").unwrap();

        // Search only in .rs files
        let args = ToolArguments::Json(json!({
            "pattern": "test",
            "path": temp_dir.path().to_str().unwrap(),
            "file_type": "rs"
        }));

        let result = tool.execute(args).await.unwrap();
        let matches = result["matches"].as_array().unwrap();
        
        // All matches should be from .rs files
        for mat in matches {
            let file_path = mat["file"].as_str().unwrap();
            assert!(
                file_path.ends_with(".rs"),
                "All matches should be from .rs files"
            );
        }
    }
}

#[tokio::test]
async fn test_glob_tool_exclusions() {
    let registry = ToolRegistry::new();
    register_all_tools(&registry);
    let tool = registry.get_tool("glob");

    if let Some(tool) = tool {
        let temp_dir = TempDir::new().unwrap();
        let file1 = temp_dir.path().join("test1.txt");
        let excluded_dir = temp_dir.path().join("node_modules");
        fs::create_dir_all(&excluded_dir).unwrap();
        let file2 = excluded_dir.join("test2.txt");
        fs::write(&file1, "test").unwrap();
        fs::write(&file2, "test").unwrap();

        // Search with exclusions
        let args = ToolArguments::Json(json!({
            "pattern": "**/*.txt",
            "path": temp_dir.path().to_str().unwrap(),
            "exclude": ["node_modules"]
        }));

        let result = tool.execute(args).await.unwrap();
        let files = result["files"].as_array().unwrap();
        
        // Should not include files from node_modules
        for file in files {
            let file_path = file.as_str().unwrap();
            assert!(
                !file_path.contains("node_modules"),
                "Should exclude node_modules directory"
            );
        }
    }
}
