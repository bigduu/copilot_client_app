use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error, HttpMessage,
};
use futures_util::future::LocalBoxFuture;
use std::future::{ready, Ready};
use std::rc::Rc;
use tracing::Instrument;
use uuid::Uuid;

/// Middleware to add distributed tracing with traceID to each request
pub struct TracingMiddleware;

impl<S, B> Transform<S, ServiceRequest> for TracingMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = TracingMiddlewareService<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(TracingMiddlewareService {
            service: Rc::new(service),
        }))
    }
}

pub struct TracingMiddlewareService<S> {
    service: Rc<S>,
}

impl<S, B> Service<ServiceRequest> for TracingMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        // Extract or generate traceID
        let trace_id = req
            .headers()
            .get("X-Trace-Id")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        // Store traceID in request extensions for later use
        req.extensions_mut().insert(TraceId(trace_id.clone()));

        let method = req.method().to_string();
        let path = req.path().to_string();
        let service = Rc::clone(&self.service);

        Box::pin(async move {
            // Create a tracing span for this request with traceID
            let span = tracing::info_span!(
                "http_request",
                trace_id = %trace_id,
                method = %method,
                path = %path
            );

            // Use the Instrument trait to instrument the future instead of holding the guard
            async move {
                tracing::debug!("Request received - method={}, path={}", method, path);

                // Call the next service
                let res = service.call(req).await?;

                tracing::debug!("Request completed - status={}", res.status());

                Ok(res)
            }
            .instrument(span)
            .await
        })
    }
}

/// Wrapper type for TraceId stored in request extensions
#[derive(Clone, Debug)]
pub struct TraceId(pub String);

impl TraceId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Helper function to extract TraceId from request
pub fn extract_trace_id(req: &actix_web::HttpRequest) -> Option<String> {
    req.extensions().get::<TraceId>().map(|t| t.0.clone())
}
