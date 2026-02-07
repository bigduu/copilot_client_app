use actix_web::{web, HttpResponse, Responder};
use copilot_agent_core::{Role, Session};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::skill_loader::{SkillDefinition, SkillLoader};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ChatRequest {
    pub message: String,
    pub session_id: Option<String>,
    #[serde(default)]
    pub system_prompt: Option<String>,
    #[serde(default)]
    pub enhance_prompt: Option<String>,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[allow(dead_code)]
    pub model: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ChatResponse {
    pub session_id: String,
    pub stream_url: String,
    pub status: String,
}

pub async fn handler(state: web::Data<AppState>, req: web::Json<ChatRequest>) -> impl Responder {
    let session_id = req
        .session_id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let existing_session = {
        let sessions = state.sessions.read().await;
        sessions.get(&session_id).cloned()
    };

    let mut session = match existing_session {
        Some(session) => session,
        None => match state.storage.load_session(&session_id).await {
            Ok(Some(session)) => session,
            _ => Session::new(session_id.clone()),
        },
    };

    let base_prompt = req
        .system_prompt
        .as_deref()
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty())
        .unwrap_or(crate::state::DEFAULT_BASE_PROMPT);
    let enhance_prompt = req
        .enhance_prompt
        .as_deref()
        .map(str::trim)
        .filter(|prompt| !prompt.is_empty());
    let workspace_path = req
        .workspace_path
        .as_deref()
        .map(str::trim)
        .filter(|workspace_path| !workspace_path.is_empty());
    let system_prompt = build_enhanced_system_prompt(
        base_prompt,
        enhance_prompt,
        workspace_path,
        &state.loaded_skills,
    );
    upsert_system_prompt_message(&mut session, system_prompt);

    session.add_message(copilot_agent_core::Message::user(req.message.clone()));

    {
        let mut sessions = state.sessions.write().await;
        sessions.insert(session_id.clone(), session.clone());
    }

    let _ = state.storage.save_session(&session).await;

    HttpResponse::Created().json(ChatResponse {
        session_id: session_id.clone(),
        stream_url: format!("/api/v1/stream/{}", session_id),
        status: "streaming".to_string(),
    })
}

fn upsert_system_prompt_message(session: &mut Session, system_prompt: String) {
    session
        .messages
        .retain(|message| !matches!(message.role, Role::System));
    session
        .messages
        .insert(0, copilot_agent_core::Message::system(system_prompt));
}

fn build_enhanced_system_prompt(
    base_prompt: &str,
    enhance_prompt: Option<&str>,
    workspace_path: Option<&str>,
    skills: &[SkillDefinition],
) -> String {
    let mut merged_prompt = base_prompt.to_string();

    if let Some(enhancement) = enhance_prompt
        .map(str::trim)
        .filter(|enhancement| !enhancement.is_empty())
    {
        merged_prompt.push_str("\n\n");
        merged_prompt.push_str(enhancement);
    }

    if let Some(workspace_path) = workspace_path
        .map(str::trim)
        .filter(|workspace_path| !workspace_path.is_empty())
    {
        merged_prompt.push_str("\n\nWorkspace path: ");
        merged_prompt.push_str(workspace_path);
        merged_prompt.push_str("\n");
        merged_prompt.push_str(crate::state::WORKSPACE_PROMPT_GUIDANCE);
    }

    SkillLoader::build_system_prompt(&merged_prompt, skills)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::skill_loader::{SkillDefinition, SkillVisibility};

    #[test]
    fn upsert_system_prompt_inserts_when_missing() {
        let mut session = Session::new("session-1");
        session.add_message(copilot_agent_core::Message::user("hello"));

        upsert_system_prompt_message(&mut session, "system prompt".to_string());

        assert!(matches!(
            session.messages.first().map(|m| &m.role),
            Some(copilot_agent_core::Role::System)
        ));
        assert_eq!(session.messages[0].content, "system prompt");
    }

    #[test]
    fn upsert_system_prompt_replaces_existing_message() {
        let mut session = Session::new("session-1");
        session.add_message(copilot_agent_core::Message::system("old"));
        session.add_message(copilot_agent_core::Message::user("hello"));

        upsert_system_prompt_message(&mut session, "new".to_string());

        let system_messages = session
            .messages
            .iter()
            .filter(|m| matches!(m.role, copilot_agent_core::Role::System))
            .count();
        assert_eq!(system_messages, 1);
        assert_eq!(session.messages[0].content, "new");
    }

    #[test]
    fn build_enhanced_system_prompt_appends_enhancement_before_skills() {
        let skills = vec![SkillDefinition {
            id: "skill-1".to_string(),
            name: "Skill One".to_string(),
            description: "A helpful skill".to_string(),
            category: "test".to_string(),
            tags: vec![],
            prompt: "Use the skill when needed".to_string(),
            tool_refs: vec![],
            workflow_refs: vec![],
            visibility: SkillVisibility::Public,
            enabled_by_default: true,
            version: "1.0.0".to_string(),
            created_at: "2025-01-01".to_string(),
            updated_at: "2025-01-01".to_string(),
        }];

        let prompt =
            build_enhanced_system_prompt("Base prompt", Some("Extra guidance"), None, &skills);

        assert!(prompt.starts_with("Base prompt\n\nExtra guidance"));
        assert!(prompt.contains("You have access to the following specialized skills"));
        assert!(prompt.contains("Skill One"));
    }

    #[test]
    fn build_enhanced_system_prompt_appends_workspace_context_before_skills() {
        let skills = vec![SkillDefinition {
            id: "skill-1".to_string(),
            name: "Skill One".to_string(),
            description: "A helpful skill".to_string(),
            category: "test".to_string(),
            tags: vec![],
            prompt: "Use the skill when needed".to_string(),
            tool_refs: vec![],
            workflow_refs: vec![],
            visibility: SkillVisibility::Public,
            enabled_by_default: true,
            version: "1.0.0".to_string(),
            created_at: "2025-01-01".to_string(),
            updated_at: "2025-01-01".to_string(),
        }];

        let prompt = build_enhanced_system_prompt(
            "Base prompt",
            Some("Extra guidance"),
            Some("/tmp/workspace"),
            &skills,
        );

        let workspace_segment =
            "Workspace path: /tmp/workspace\nIf you need to inspect files, check the workspace first, then ~/.bodhi.";

        assert!(prompt.contains(workspace_segment));

        let workspace_index = prompt.find(workspace_segment).unwrap();
        let skills_index = prompt
            .find("You have access to the following specialized skills")
            .unwrap();
        assert!(workspace_index < skills_index);
    }

    #[test]
    fn build_enhanced_system_prompt_ignores_empty_enhancement() {
        let prompt = build_enhanced_system_prompt("Base prompt", Some("   "), None, &[]);
        assert_eq!(prompt, "Base prompt");
    }
}
