use actix_web::{web, HttpResponse, Responder};
use chrono::NaiveDate;
use serde::Deserialize;

use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MetricsSummaryQuery {
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
}

#[derive(Debug, Deserialize)]
pub struct MetricsSessionsQuery {
    pub start_date: Option<NaiveDate>,
    pub end_date: Option<NaiveDate>,
    pub model: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct MetricsDailyQuery {
    pub days: Option<u32>,
    pub end_date: Option<NaiveDate>,
    pub granularity: Option<String>,
}

pub async fn summary(
    state: web::Data<AppState>,
    query: web::Query<MetricsSummaryQuery>,
) -> impl Responder {
    match state
        .metrics_service
        .summary(query.start_date, query.end_date)
        .await
    {
        Ok(summary) => HttpResponse::Ok().json(summary),
        Err(error) => internal_error(error),
    }
}

pub async fn by_model(
    state: web::Data<AppState>,
    query: web::Query<MetricsSummaryQuery>,
) -> impl Responder {
    match state
        .metrics_service
        .by_model(query.start_date, query.end_date)
        .await
    {
        Ok(data) => HttpResponse::Ok().json(data),
        Err(error) => internal_error(error),
    }
}

pub async fn sessions(
    state: web::Data<AppState>,
    query: web::Query<MetricsSessionsQuery>,
) -> impl Responder {
    let filter = agent_metrics::SessionMetricsFilter {
        start_date: query.start_date,
        end_date: query.end_date,
        model: query.model.clone(),
        limit: query.limit,
    };

    match state.metrics_service.sessions(filter).await {
        Ok(data) => HttpResponse::Ok().json(data),
        Err(error) => internal_error(error),
    }
}

pub async fn session_detail(state: web::Data<AppState>, path: web::Path<String>) -> impl Responder {
    let session_id = path.into_inner();
    match state.metrics_service.session_detail(&session_id).await {
        Ok(Some(detail)) => HttpResponse::Ok().json(detail),
        Ok(None) => HttpResponse::NotFound().json(serde_json::json!({
            "error": "Metrics for session not found",
            "session_id": session_id,
        })),
        Err(error) => internal_error(error),
    }
}

pub async fn daily(
    state: web::Data<AppState>,
    query: web::Query<MetricsDailyQuery>,
) -> impl Responder {
    let days = query.days.unwrap_or(30).max(1).min(365);
    let granularity = query.granularity.as_deref().unwrap_or("daily");

    match granularity {
        "weekly" => match state.metrics_service.weekly(days, query.end_date).await {
            Ok(data) => HttpResponse::Ok().json(data),
            Err(error) => internal_error(error),
        },
        "monthly" => match state.metrics_service.monthly(days, query.end_date).await {
            Ok(data) => HttpResponse::Ok().json(data),
            Err(error) => internal_error(error),
        },
        _ => match state.metrics_service.daily(days, query.end_date).await {
            Ok(data) => HttpResponse::Ok().json(data),
            Err(error) => internal_error(error),
        },
    }
}

fn internal_error(error: impl std::fmt::Display) -> HttpResponse {
    HttpResponse::InternalServerError().json(serde_json::json!({
        "error": error.to_string(),
    }))
}
