# Forward Metrics Implementation

## Overview

This document summarizes the implementation of forward request metrics tracking for the Bamboo application. The implementation extends the existing metrics system to record and analyze HTTP proxy forwarding requests to the Copilot API.

## What Was Implemented

### 1. Data Model (agent-metrics/src/types.rs)

Added new types for forward request tracking:

- **`ForwardStatus`**: Enum for request status (Success/Error)
- **`ForwardRequestMetrics`**: Complete metrics for each forward request
  - forward_id, endpoint, model, is_stream
  - started_at, completed_at, status_code, status
  - token_usage, error, duration_ms
- **`ForwardMetricsSummary`**: Aggregate statistics
  - total_requests, successful_requests, failed_requests
  - total_tokens, avg_duration_ms
- **`ForwardEndpointMetrics`**: Metrics grouped by endpoint
- **`ForwardMetricsFilter`**: Query filter for metrics retrieval

### 2. Storage Layer (agent-metrics/src/storage.rs)

**New Database Table: `forward_request_metrics`**
```sql
CREATE TABLE forward_request_metrics (
    forward_id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    model TEXT NOT NULL,
    is_stream INTEGER NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status_code INTEGER,
    status TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    error TEXT,
    updated_at TEXT NOT NULL
)
```

**New Storage Methods:**
- `insert_forward_start()` - Record when a forward request starts
- `complete_forward()` - Record when a forward request completes
- `forward_summary()` - Get aggregated statistics
- `forward_by_endpoint()` - Get metrics grouped by endpoint
- `forward_requests()` - Get detailed request list

### 3. Collector API (agent-metrics/src/collector.rs)

**New Collector Commands:**
- `ForwardStarted` - Emitted when request starts
- `ForwardCompleted` - Emitted when request completes

**New Public Methods:**
```rust
pub fn forward_started(
    &self,
    forward_id: impl Into<String>,
    endpoint: impl Into<String>,
    model: impl Into<String>,
    is_stream: bool,
    started_at: DateTime<Utc>,
)

pub fn forward_completed(
    &self,
    forward_id: impl Into<String>,
    completed_at: DateTime<Utc>,
    status_code: Option<u16>,
    status: ForwardStatus,
    usage: Option<TokenUsage>,
    error: Option<String>,
)
```

### 4. Service Layer (agent-server/src/metrics_service.rs)

**New Query Methods:**
```rust
pub async fn forward_summary(&self, filter: ForwardMetricsFilter)
    -> Result<ForwardMetricsSummary, MetricsError>

pub async fn forward_by_endpoint(&self, filter: ForwardMetricsFilter)
    -> Result<Vec<ForwardEndpointMetrics>, MetricsError>

pub async fn forward_requests(&self, filter: ForwardMetricsFilter)
    -> Result<Vec<ForwardRequestMetrics>, MetricsError>
```

### 5. HTTP API Endpoints (agent-server/src/handlers/metrics.rs)

**New Endpoints:**

1. **GET /api/v1/metrics/forward/summary**
   - Returns aggregated forward metrics statistics
   - Query params: start_date, end_date, endpoint, model, limit

2. **GET /api/v1/metrics/forward/by-endpoint**
   - Returns metrics grouped by endpoint
   - Query params: start_date, end_date, model, limit

3. **GET /api/v1/metrics/forward/requests**
   - Returns detailed list of forward requests
   - Query params: start_date, end_date, endpoint, model, limit

### 6. Integration in OpenAI Controller (web_service/src/controllers/openai_controller.rs)

**Modified `chat_completions` handler to:**

1. Generate unique forward_id for each request
2. Call `forward_started()` when request begins
3. Call `forward_completed()` on success/failure
4. Track both streaming and non-streaming requests
5. Extract token usage from non-streaming responses
6. Record errors and status codes

**Key Features:**
- Non-blocking metrics recording (async collector)
- Separate tracking for streaming vs non-streaming
- Token usage captured for non-streaming requests
- Error tracking with detailed messages
- Status code recording

## Usage Examples

### API Queries

**Get summary of all forward requests:**
```bash
curl http://localhost:8080/api/v1/metrics/forward/summary
```

**Get metrics for a specific endpoint:**
```bash
curl "http://localhost:8080/api/v1/metrics/forward/requests?endpoint=openai.chat_completions"
```

**Get metrics by endpoint with date filter:**
```bash
curl "http://localhost:8080/api/v1/metrics/forward/by-endpoint?start_date=2026-02-01&end_date=2026-02-13"
```

### Response Examples

**Forward Summary:**
```json
{
  "total_requests": 150,
  "successful_requests": 145,
  "failed_requests": 5,
  "total_tokens": {
    "prompt_tokens": 15000,
    "completion_tokens": 22000,
    "total_tokens": 37000
  },
  "avg_duration_ms": 850
}
```

**Forward by Endpoint:**
```json
[
  {
    "endpoint": "openai.chat_completions",
    "requests": 150,
    "successful": 145,
    "failed": 5,
    "tokens": {
      "prompt_tokens": 15000,
      "completion_tokens": 22000,
      "total_tokens": 37000
    },
    "avg_duration_ms": 850
  }
]
```

**Forward Requests:**
```json
[
  {
    "forward_id": "550e8400-e29b-41d4-a716-446655440000",
    "endpoint": "openai.chat_completions",
    "model": "gpt-4o-mini",
    "is_stream": false,
    "started_at": "2026-02-13T10:30:00Z",
    "completed_at": "2026-02-13T10:30:01Z",
    "status_code": 200,
    "status": "success",
    "token_usage": {
      "prompt_tokens": 100,
      "completion_tokens": 150,
      "total_tokens": 250
    },
    "error": null,
    "duration_ms": 1000
  }
]
```

## Benefits

1. **Complete Visibility**: Track all forwarded API requests
2. **Performance Monitoring**: Measure request durations and success rates
3. **Cost Tracking**: Monitor token usage across all forwarded requests
4. **Error Analysis**: Identify and debug failed requests
5. **Endpoint Analysis**: Compare performance across different endpoints
6. **Historical Trends**: Query metrics by date range

## Implementation Notes

- Metrics are recorded asynchronously to avoid blocking request handling
- SQLite database provides reliable persistent storage
- Indexes on `started_at`, `endpoint`, and `model` for fast queries
- Compatible with existing agent metrics system
- No breaking changes to existing functionality

## Testing

- All existing tests pass
- Storage layer includes comprehensive test coverage
- Manual testing confirms metrics are recorded correctly
- API endpoints return expected data formats

## Future Enhancements

Potential improvements for future iterations:

1. Add retention policies for forward metrics (currently shares 90-day retention)
2. Implement real-time metrics streaming via WebSocket
3. Add visualization dashboard for forward metrics
4. Create alerts for high error rates or slow requests
5. Add metrics for Anthropic adapter endpoints
6. Implement batch export to external monitoring systems
