use std::collections::HashMap;
use std::path::{Path, PathBuf};

use log::{debug, info, warn};
use tokio::fs;

use crate::store::parser::{parse_markdown_skill, render_skill_markdown};
use crate::types::{SkillDefinition, SkillId, SkillResult};

pub async fn ensure_skills_dir(skills_dir: &Path) -> SkillResult<()> {
    fs::create_dir_all(skills_dir).await?;
    Ok(())
}

pub async fn load_skills_from_dir(
    skills_dir: &Path,
) -> SkillResult<HashMap<SkillId, SkillDefinition>> {
    debug!("Loading skills from {:?}", skills_dir);

    let mut entries = fs::read_dir(skills_dir).await?;
    let mut loaded: HashMap<SkillId, SkillDefinition> = HashMap::new();

    while let Some(entry) = entries.next_entry().await? {
        let path = entry.path();
        if !path.extension().is_some_and(|ext| ext == "md") {
            continue;
        }

        match fs::read_to_string(&path).await {
            Ok(content) => match parse_markdown_skill(&path, &content) {
                Ok(skill) => {
                    loaded.insert(skill.id.clone(), skill);
                }
                Err(error) => {
                    warn!("Failed to parse skill file {:?}: {}", path, error);
                }
            },
            Err(error) => {
                warn!("Failed to read skill file {:?}: {}", path, error);
            }
        }
    }

    info!("Loaded {} skills", loaded.len());
    Ok(loaded)
}

pub fn skill_path(skills_dir: &Path, skill_id: &str) -> PathBuf {
    skills_dir.join(format!("{skill_id}.md"))
}

pub async fn write_skill_file(skills_dir: &Path, skill: &SkillDefinition) -> SkillResult<()> {
    let path = skill_path(skills_dir, &skill.id);
    let content = render_skill_markdown(skill)?;
    fs::write(path, content).await?;
    Ok(())
}
