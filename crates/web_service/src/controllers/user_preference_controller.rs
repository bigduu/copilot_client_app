use crate::server::AppState;
use crate::services::user_preference_service::UserPreferenceUpdate;
use actix_web::{web, web::Data, web::Json, HttpResponse};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct UpdateUserPreferencesRequest {
    #[serde(default)]
    pub last_opened_chat_id: Option<Option<Uuid>>,
    #[serde(default)]
    pub auto_generate_titles: Option<bool>,
}

pub fn config(cfg: &mut web::ServiceConfig) {
    cfg.route(
        "/user/preferences",
        web::get().to(|app_state: Data<AppState>| async move {
            let prefs = app_state
                .user_preference_service
                .get_preferences()
                .await
                .map_err(actix_web::Error::from)?;
            Ok::<HttpResponse, actix_web::Error>(HttpResponse::Ok().json(prefs))
        }),
    )
    .route(
        "/user/preferences",
        web::put().to(
            |app_state: Data<AppState>, payload: Json<UpdateUserPreferencesRequest>| async move {
                let update = UserPreferenceUpdate {
                    last_opened_chat_id: payload.last_opened_chat_id,
                    auto_generate_titles: payload.auto_generate_titles,
                };

                let prefs = app_state
                    .user_preference_service
                    .update_preferences(update)
                    .await
                    .map_err(actix_web::Error::from)?;

                Ok::<HttpResponse, actix_web::Error>(HttpResponse::Ok().json(prefs))
            },
        ),
    );
}
