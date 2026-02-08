# TodoList Component

A React component for displaying and managing AI task lists in chat interfaces.

## Features

- **Real-time Updates**: Receive task status updates in real-time via SSE connection
- **Collapsible**: Click the header to collapse/expand
- **Pinnable**: When pinned, the component stays visible and doesn't auto-collapse
- **Progress Display**: Shows overall progress bar and completion percentage
- **Status Icons**: Different statuses represented by different icons (⭕🔄✅⚠️)
- **Dependency Display**: Shows dependencies between tasks
- **Notes Display**: Shows notes for each task

## Usage

```tsx
import TodoList from './components/TodoList';

function ChatPage() {
  return (
    <div>
      <TodoList
        sessionId="your-session-uuid"
        apiBaseUrl="http://localhost:8080"
        initialCollapsed={true}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|--------|------|
| `sessionId` | `string` | Required | Session ID |
| `apiBaseUrl` | `string` | Required | API base URL |
| `initialCollapsed` | `boolean` | `true` | Whether initially collapsed |

## Backend API

### HTTP API

```
GET /api/v1/todo/{session_id}
```

Returns complete Todo List information.

```
GET /api/v1/todo/{session_id}/exists
```

Checks if a Todo List exists.

### SSE Events

Connect to `/api/v1/stream/{session_id}` to receive real-time updates:

```javascript
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'todo_list_updated') {
    // Update UI
  }
};
```

## AI Tools

AI can manage task lists through the following tools:

### create_todo_list

Create a task list:
```json
{
  "title": "Refactor Code",
  "items": [
    {"id": "1", "description": "Analyze code"},
    {"id": "2", "description": "Write implementation", "depends_on": ["1"]}
  ]
}
```

### update_todo_item

Update task status:
```json
{
  "item_id": "1",
  "status": "completed",
  "notes": "Analysis completed"
}
```

## Status Descriptions

| Status | Icon | Description |
|------|------|------|
| `pending` | ⭕ | Pending |
| `in_progress` | 🔄 | In Progress |
| `completed` | ✅ | Completed |
| `blocked` | ⚠️ | Blocked |

## File Structure

```
TodoList/
├── index.ts           # Exports
├── TodoList.tsx       # Component
├── TodoList.module.css # Styles
├── UsageExample.tsx   # Usage examples
└── README.md          # Documentation
```

## Notes

1. The component automatically connects to SSE, no manual refresh needed
2. If SSE disconnects, it will automatically reconnect
3. When pinned, the component won't collapse
4. Progress bar turns green when 100% complete
5. Supports dark theme (via CSS variables)

## Dark Theme

The component supports dark theme through CSS variables:

```css
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --primary-color: #1890ff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #141414;
    --bg-secondary: #1f1f1f;
    --text-primary: #e0e0e0;
    --primary-color: #1890ff;
  }
}
```

Or pass CSS variables through parent component.
