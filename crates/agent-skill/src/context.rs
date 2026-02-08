use crate::types::SkillDefinition;

/// Build system prompt context text from enabled skills.
pub fn build_skill_context(skills: &[SkillDefinition]) -> String {
    if skills.is_empty() {
        log::debug!("No enabled skills, returning empty context");
        return String::new();
    }

    log::info!(
        "Building skill context from {} skill(s): [{}]",
        skills.len(),
        skills.iter().map(|s| s.id.as_str()).collect::<Vec<_>>().join(", ")
    );

    let mut context = String::from("\n\n## Available Skills\n");

    for skill in skills {
        log::debug!(
            "Adding skill '{}' with {} tool(s), {} workflow(s)",
            skill.id,
            skill.tool_refs.len(),
            skill.workflow_refs.len()
        );
        context.push_str(&format!("\n### {}\n", skill.name));
        context.push_str(&skill.description);

        if !skill.prompt.is_empty() {
            context.push_str(&format!("\n\n{}", skill.prompt));
        }

        if !skill.tool_refs.is_empty() {
            context.push_str("\n\n**Available Tools:** ");
            context.push_str(&skill.tool_refs.join(", "));
        }

        if !skill.workflow_refs.is_empty() {
            context.push_str("\n\n**Related Workflows:** ");
            context.push_str(&skill.workflow_refs.join(", "));
        }

        context.push('\n');
    }

    log::info!("Skill context built: {} chars", context.len());
    log::debug!("Skill context content:\n{}", context);

    context
}

#[cfg(test)]
mod tests {
    use crate::types::SkillDefinition;

    use super::build_skill_context;

    #[test]
    fn build_skill_context_returns_empty_for_empty_input() {
        assert!(build_skill_context(&[]).is_empty());
    }

    #[test]
    fn build_skill_context_renders_sections() {
        let skill = SkillDefinition::new(
            "demo-skill",
            "Demo Skill",
            "A demo skill",
            "demo",
            "Always do demo things.",
        )
        .with_tool_ref("read_file")
        .with_workflow_ref("demo-workflow");

        let context = build_skill_context(&[skill]);

        assert!(context.contains("## Available Skills"));
        assert!(context.contains("### Demo Skill"));
        assert!(context.contains("A demo skill"));
        assert!(context.contains("Always do demo things."));
        assert!(context.contains("**Available Tools:** read_file"));
        assert!(context.contains("**Related Workflows:** demo-workflow"));
    }
}
