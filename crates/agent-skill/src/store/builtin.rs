use crate::types::SkillDefinition;

pub fn create_builtin_skills() -> Vec<SkillDefinition> {
    vec![
        SkillDefinition::new(
            "builtin-file-analysis",
            "File Analysis",
            "Read and analyze file contents, providing summaries and key information",
            "analysis",
            "You are a file analysis expert. Use the read_file tool to read files, then provide a structured analysis including:\n1. File type and purpose\n2. Main content summary\n3. Key code/data snippets\n4. Potential issues or improvements",
        )
        .with_tool_ref("read_file")
        .with_tag("files")
        .with_tag("analysis")
        .with_enabled_by_default(true),
        SkillDefinition::new(
            "builtin-code-review",
            "Code Review",
            "Review code changes to identify potential issues and improvement opportunities",
            "development",
            "You are a code review expert. When analyzing code changes, focus on:\n1. Code quality and readability\n2. Potential bugs and security issues\n3. Performance impact\n4. Alignment with best practices\n5. Test coverage",
        )
        .with_tool_ref("read_file")
        .with_tag("code")
        .with_tag("review")
        .with_enabled_by_default(true),
        SkillDefinition::new(
            "builtin-project-setup",
            "Project Setup",
            "Help set up new projects by creating necessary configuration files and directory structures",
            "development",
            "You are a project setup expert. When helping users set up a new project:\n1. Analyze project type and requirements\n2. Create a recommended directory structure\n3. Generate basic configuration files\n4. Provide next-step guidance",
        )
        .with_workflow_ref("create-project")
        .with_tag("project")
        .with_tag("setup"),
    ]
}
