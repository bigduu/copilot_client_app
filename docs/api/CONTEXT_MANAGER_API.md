# Context Manager API Documentation

**Version**: 2.0.0  
**Last Updated**: 2025-11-09  
**Status**: Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [REST API](#rest-api)
4. [Server-Sent Events (SSE)](#server-sent-events-sse)
5. [Data Models](#data-models)
6. [Error Handling](#error-handling)
7. [Examples](#examples)

---

## Overview

The Context Manager API provides a complete backend interface for managing conversation contexts, messages, branches, and tool executions. It follows REST principles for data operations and uses Server-Sent Events (SSE) for real-time updates.

### Base URL

```
http://localhost:3000/api
```

### Content Type

All requests and responses use `application/json` unless otherwise specified.

---

## Authentication

Currently, the API runs locally and does not require authentication. Future versions may add API key authentication for remote access.

---

## REST API

### Contexts

#### List All Contexts

```http
GET /api/contexts
```

**Response**:
```json
{
  "contexts": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "config": {
        "model_id": "gpt-4",
        "mode": "code"
      },
      "active_branch_name": "main",
      "current_state": "Idle",
      "created_at": "2025-11-09T10:00:00Z",
      "updated_at": "2025-11-09T10:05:00Z"
    }
  ]
}
```

#### Create Context

```http
POST /api/contexts
Content-Type: application/json

{
  "model_id": "gpt-4",
  "mode": "code",
  "system_prompt_id": "default",
  "workspace_path": "/path/to/workspace"
}
```

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "config": {
    "model_id": "gpt-4",
    "mode": "code",
    "parameters": {},
    "system_prompt_id": "default",
    "agent_role": "assistant",
    "workspace_path": "/path/to/workspace"
  },
  "branches": {
    "main": {
      "name": "main",
      "message_ids": [],
      "parent_message_id": null
    }
  },
  "active_branch_name": "main",
  "current_state": "Idle",
  "created_at": "2025-11-09T10:00:00Z",
  "updated_at": "2025-11-09T10:00:00Z"
}
```

#### Get Context

```http
GET /api/contexts/{context_id}
```

**Response**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "config": { ... },
  "message_pool": {
    "msg-1": {
      "message": {
        "role": "user",
        "content": [{"type": "text", "text": "Hello"}],
        "message_type": "text"
      },
      "parent_id": null
    }
  },
  "branches": { ... },
  "active_branch_name": "main",
  "current_state": "Idle"
}
```

#### Update Context Config

```http
PUT /api/contexts/{context_id}
Content-Type: application/json

{
  "mode": "plan",
  "system_prompt_id": "custom-prompt"
}
```

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "config": {
    "model_id": "gpt-4",
    "mode": "plan",
    "system_prompt_id": "custom-prompt"
  }
}
```

#### Delete Context

```http
DELETE /api/contexts/{context_id}
```

**Response** (204 No Content)

---

### Messages

#### Get Messages

```http
GET /api/contexts/{context_id}/messages?branch=main&limit=50&offset=0
```

**Query Parameters**:
- `branch` (optional): Branch name (default: active branch)
- `limit` (optional): Max messages to return (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response**:
```json
{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": [{"type": "text", "text": "Hello"}],
      "message_type": "text",
      "metadata": {
        "created_at": "2025-11-09T10:00:00Z"
      }
    },
    {
      "id": "msg-2",
      "role": "assistant",
      "content": [{"type": "text", "text": "Hi there!"}],
      "message_type": "text",
      "metadata": {
        "created_at": "2025-11-09T10:01:00Z"
      }
    }
  ],
  "total": 2,
  "has_more": false
}
```

#### Add User Message

```http
POST /api/contexts/{context_id}/messages
Content-Type: application/json

{
  "content": "What's the weather in London?",
  "branch": "main"
}
```

**Response** (201 Created):
```json
{
  "message_id": "msg-3",
  "context_state": "ProcessingUserMessage"
}
```

**Note**: This triggers the FSM to process the message and send it to the LLM. Subscribe to SSE for real-time updates.

#### Get Specific Message

```http
GET /api/contexts/{context_id}/messages/{message_id}
```

**Response**:
```json
{
  "id": "msg-1",
  "role": "user",
  "content": [{"type": "text", "text": "Hello"}],
  "message_type": "text",
  "metadata": {
    "created_at": "2025-11-09T10:00:00Z",
    "tokens": {
      "prompt": 10,
      "completion": 0,
      "total": 10
    }
  },
  "parent_id": null
}
```

---

### Branches

#### Create Branch

```http
POST /api/contexts/{context_id}/branches
Content-Type: application/json

{
  "name": "alternative-approach",
  "parent_message_id": "msg-5"
}
```

**Response** (201 Created):
```json
{
  "name": "alternative-approach",
  "message_ids": [],
  "parent_message_id": "msg-5"
}
```

#### Switch Branch

```http
PUT /api/contexts/{context_id}/branches/{branch_name}
```

**Response** (200 OK):
```json
{
  "active_branch_name": "alternative-approach",
  "message_count": 0
}
```

#### List Branches

```http
GET /api/contexts/{context_id}/branches
```

**Response**:
```json
{
  "branches": [
    {
      "name": "main",
      "message_ids": ["msg-1", "msg-2", "msg-3"],
      "parent_message_id": null,
      "is_active": true
    },
    {
      "name": "alternative-approach",
      "message_ids": [],
      "parent_message_id": "msg-5",
      "is_active": false
    }
  ]
}
```

---

### Tool Execution

#### Approve Tool Calls

```http
POST /api/contexts/{context_id}/tools/approve
Content-Type: application/json

{
  "tool_call_ids": ["tool-1", "tool-2"]
}
```

**Response** (200 OK):
```json
{
  "approved_count": 2,
  "context_state": "ExecutingTools"
}
```

#### Get Tool Call Status

```http
GET /api/contexts/{context_id}/tools/{tool_call_id}
```

**Response**:
```json
{
  "id": "tool-1",
  "tool_name": "get_weather",
  "arguments": {
    "location": "London"
  },
  "approval_status": "Approved",
  "result": {
    "temperature": 15,
    "condition": "Cloudy"
  },
  "executed_at": "2025-11-09T10:02:00Z"
}
```

---

### State

#### Get Current State

```http
GET /api/contexts/{context_id}/state
```

**Response**:
```json
{
  "current_state": "StreamingLLMResponse",
  "can_send_message": false,
  "pending_tool_approvals": 0
}
```

---

## Server-Sent Events (SSE)

### Subscribe to Events

```http
GET /api/contexts/{context_id}/events
Accept: text/event-stream
```

### Event Types

#### StateChanged

Emitted when the context FSM state changes.

```
event: StateChanged
data: {"context_id": "550e8400-e29b-41d4-a716-446655440000", "new_state": "StreamingLLMResponse", "timestamp": "2025-11-09T10:00:00Z"}
```

#### ContentDelta

Emitted during streaming responses.

```
event: ContentDelta
data: {"context_id": "550e8400-e29b-41d4-a716-446655440000", "message_id": "msg-5", "delta": "Hello ", "sequence": 1}
```

#### MessageCompleted

Emitted when a message is fully processed.

```
event: MessageCompleted
data: {"context_id": "550e8400-e29b-41d4-a716-446655440000", "message_id": "msg-5", "final_content": "Hello world!"}
```

#### ToolCallRequested

Emitted when the LLM requests tool execution.

```
event: ToolCallRequested
data: {"context_id": "550e8400-e29b-41d4-a716-446655440000", "tool_calls": [{"id": "tool-1", "name": "get_weather", "arguments": {"location": "London"}}]}
```

#### Heartbeat

Emitted every 30 seconds to keep connection alive.

```
event: Heartbeat
data: {"timestamp": "2025-11-09T10:00:00Z"}
```

---

## Data Models

### ChatContext

```typescript
interface ChatContext {
  id: string;
  parent_id?: string;
  config: ChatConfig;
  message_pool: Record<string, MessageNode>;
  branches: Record<string, Branch>;
  active_branch_name: string;
  current_state: ContextState;
  created_at: string;
  updated_at: string;
}
```

### ChatConfig

```typescript
interface ChatConfig {
  model_id: string;
  mode: string;
  parameters: Record<string, any>;
  system_prompt_id?: string;
  agent_role: string;
  workspace_path?: string;
}
```

### MessageNode

```typescript
interface MessageNode {
  message: InternalMessage;
  parent_id?: string;
}
```

### InternalMessage

```typescript
interface InternalMessage {
  role: "user" | "assistant" | "system";
  content: ContentPart[];
  message_type: "text" | "plan" | "question" | "tool_call" | "tool_result";
  metadata?: MessageMetadata;
}
```

### Branch

```typescript
interface Branch {
  name: string;
  message_ids: string[];
  parent_message_id?: string;
}
```

### ContextState

```typescript
type ContextState =
  | "Idle"
  | "ProcessingUserMessage"
  | "AwaitingLLMResponse"
  | "StreamingLLMResponse"
  | "ProcessingLLMResponse"
  | "AwaitingToolApproval"
  | "ExecutingTools"
  | "TransientFailure"
  | "PermanentFailure";
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "CONTEXT_NOT_FOUND",
    "message": "Context with ID 550e8400-e29b-41d4-a716-446655440000 not found",
    "details": {}
  }
}
```

### Common Error Codes

- `CONTEXT_NOT_FOUND` (404): Context does not exist
- `INVALID_STATE` (400): Operation not allowed in current state
- `BRANCH_NOT_FOUND` (404): Branch does not exist
- `MESSAGE_NOT_FOUND` (404): Message does not exist
- `VALIDATION_ERROR` (400): Invalid request data
- `INTERNAL_ERROR` (500): Server error

---

## Examples

### Complete Conversation Flow

```javascript
// 1. Create context
const context = await fetch('/api/contexts', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    model_id: 'gpt-4',
    mode: 'code'
  })
}).then(r => r.json());

// 2. Subscribe to events
const eventSource = new EventSource(`/api/contexts/${context.id}/events`);
eventSource.addEventListener('ContentDelta', (e) => {
  const data = JSON.parse(e.data);
  console.log('Streaming:', data.delta);
});

// 3. Send message
await fetch(`/api/contexts/${context.id}/messages`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    content: 'Hello, how are you?'
  })
});

// 4. Events will stream automatically
```

---

## Rate Limits

Currently no rate limits. Future versions may implement:
- 100 requests/minute per context
- 10 concurrent SSE connections per client

---

## Changelog

### v2.0.0 (2025-11-09)
- Complete refactor to backend-first architecture
- Added SSE support for real-time updates
- Implemented context-local message pools
- Added branch management APIs
- Improved error handling

### v1.0.0 (2024-XX-XX)
- Initial release

