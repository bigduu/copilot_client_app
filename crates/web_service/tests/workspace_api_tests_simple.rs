#[cfg(test)]
mod tests {
    use tempfile::TempDir;
    use tokio::fs;
    use web_service::workspace_service::WorkspaceService;

    #[tokio::test]
    async fn test_workspace_service_validation() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        // Create a test workspace
        let test_workspace = temp_dir.path().join("test_project");
        fs::create_dir_all(&test_workspace).await.unwrap();
        fs::write(test_workspace.join("package.json"), r#"{"name": "test"}"#)
            .await
            .unwrap();
        fs::write(test_workspace.join("README.md"), "# Test Project")
            .await
            .unwrap();

        // Test validation
        let result = workspace_service
            .validate_path(&test_workspace.to_string_lossy())
            .await
            .unwrap();

        assert!(result.is_valid);
        assert_eq!(result.path, test_workspace.to_string_lossy());
        assert!(result.file_count.unwrap() > 0);
    }

    #[tokio::test]
    async fn test_workspace_service_validation_invalid() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        // Test with non-existent path
        let result = workspace_service
            .validate_path("/nonexistent/path")
            .await
            .unwrap();

        assert!(!result.is_valid);
        assert!(result.error_message.is_some());
    }

    #[tokio::test]
    async fn test_workspace_service_recent_workspaces() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        // Create test workspaces
        let workspace1 = temp_dir.path().join("workspace1");
        let workspace2 = temp_dir.path().join("workspace2");
        fs::create_dir_all(&workspace1).await.unwrap();
        fs::create_dir_all(&workspace2).await.unwrap();

        // Add workspace indicators to make them valid workspaces
        fs::write(workspace1.join("Cargo.toml"), "[package]")
            .await
            .unwrap();
        fs::write(workspace2.join("package.json"), r#"{"name": "workspace2"}"#)
            .await
            .unwrap();

        // Add first workspace
        workspace_service
            .add_recent_workspace(&workspace1.to_string_lossy(), None)
            .await
            .unwrap();

        // Get recent workspaces
        let recent = workspace_service.get_recent_workspaces().await.unwrap();
        assert_eq!(recent.len(), 1);
        assert_eq!(recent[0].path, workspace1.to_string_lossy());

        // Add second workspace
        workspace_service
            .add_recent_workspace(&workspace2.to_string_lossy(), None)
            .await
            .unwrap();

        // Get recent workspaces - should now have 2
        let recent = workspace_service.get_recent_workspaces().await.unwrap();
        assert_eq!(recent.len(), 2);
    }

    #[tokio::test]
    async fn test_workspace_service_suggestions() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        let suggestions = workspace_service.get_path_suggestions().await.unwrap();
        assert!(!suggestions.suggestions.is_empty());

        // Check that suggestions have required fields
        for suggestion in suggestions.suggestions {
            assert!(!suggestion.path.is_empty());
            assert!(!suggestion.name.is_empty());
        }
    }

    #[tokio::test]
    async fn test_workspace_service_edge_cases() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        // Test with empty path
        let result = workspace_service.validate_path("").await.unwrap();
        assert!(!result.is_valid);
        assert!(result.error_message.unwrap().contains("does not exist"));

        // Test with file instead of directory
        let test_file = temp_dir.path().join("test_file.txt");
        fs::write(&test_file, "test content").await.unwrap();

        let result = workspace_service
            .validate_path(&test_file.to_string_lossy())
            .await
            .unwrap();

        assert!(!result.is_valid);
        assert!(result.error_message.unwrap().contains("directory"));
    }

    #[tokio::test]
    async fn test_workspace_service_file_counting() {
        let temp_dir = TempDir::new().unwrap();
        let workspace_service = WorkspaceService::new(temp_dir.path().to_path_buf());

        // Create workspace with known number of files
        let test_workspace = temp_dir.path().join("count_test");
        fs::create_dir_all(&test_workspace).await.unwrap();

        // Create exactly 5 files plus a workspace indicator
        for i in 1..=5 {
            fs::write(
                test_workspace.join(format!("file{}.txt", i)),
                format!("content {}", i),
            )
            .await
            .unwrap();
        }

        // Add a workspace indicator to make it a valid workspace
        fs::write(
            test_workspace.join("package.json"),
            r#"{"name": "test-project"}"#,
        )
        .await
        .unwrap();

        let result = workspace_service
            .validate_path(&test_workspace.to_string_lossy())
            .await
            .unwrap();

        assert!(result.is_valid);
        assert_eq!(result.file_count.unwrap(), 6); // 5 files + 1 package.json
    }
}
