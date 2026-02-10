import React, { useEffect, useState, useCallback, useRef } from 'react';
import { agentApiClient } from '../../services/api';
import { getBackendBaseUrl } from '../../shared/utils/backendBaseUrl';
import styles from './TodoList.module.css';

// Type definitions
export interface TodoItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  depends_on: string[];
  notes: string;
}

export interface TodoListData {
  session_id: string;
  title: string;
  items: TodoItem[];
  progress: {
    completed: number;
    total: number;
    percentage: number;
  };
}

interface TodoListProps {
  sessionId: string;
  initialCollapsed?: boolean;
}

// Status icon mapping
const statusIcons: Record<TodoItem['status'], string> = {
  pending: '⭕',
  in_progress: '🔄',
  completed: '✅',
  blocked: '⚠️',
};

// Status style mapping
const statusClassNames: Record<TodoItem['status'], string> = {
  pending: styles.statusPending,
  in_progress: styles.statusInProgress,
  completed: styles.statusCompleted,
  blocked: styles.statusBlocked,
};

// Status text mapping
const statusTexts: Record<TodoItem['status'], string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
};

export const TodoList: React.FC<TodoListProps> = ({
  sessionId,
  initialCollapsed = true,
}) => {
  const [todoList, setTodoList] = useState<TodoListData | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isPinned, setIsPinned] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECT_ATTEMPTS = 3;

  // Fetch Todo List via HTTP
  const fetchTodoList = useCallback(async () => {
    try {
      const data = await agentApiClient.get<TodoListData>(`todo/${sessionId}`);
      if (data.items?.length > 0) {
        setTodoList(data);
      } else {
        setTodoList(null);
      }
    } catch (err) {
      // Handle 404 - no todo list for this session yet
      if (err instanceof Error && err.message.includes('404')) {
        setTodoList(null);
        return;
      }
      console.error('Failed to fetch todo list:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  // Connect to SSE for real-time updates
  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Build SSE URL using backend base URL
    // Stream endpoint is under /api/v1, not /v1
    const baseUrl = getBackendBaseUrl().replace(/\/$/, '').replace(/\/v1$/, '');
    const sseUrl = `${baseUrl}/api/v1/stream/${sessionId}`;
    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    // Track if stream ended normally (don't reconnect if conversation completed)
    let isStreamCompleted = false;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'todo_list_updated':
            const updatedList: TodoListData = {
              session_id: data.todo_list.session_id,
              title: data.todo_list.title,
              items: data.todo_list.items,
              progress: {
                completed: data.todo_list.items.filter(
                  (i: TodoItem) => i.status === 'completed'
                ).length,
                total: data.todo_list.items.length,
                percentage: Math.round(
                  (data.todo_list.items.filter((i: TodoItem) => i.status === 'completed').length /
                    data.todo_list.items.length) *
                    100
                ),
              },
            };
            setTodoList(updatedList);
            setError(null);
            break;

          case 'complete':
            // Conversation completed, mark stream as done
            isStreamCompleted = true;
            break;

          case 'error':
            console.error('SSE error:', data.message);
            setError(data.message);
            break;
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();

      // Don't reconnect if conversation completed normally
      if (isStreamCompleted) {
        console.log('SSE ended: conversation completed');
        return;
      }

      // Limit reconnection attempts to avoid infinite loops
      reconnectCountRef.current += 1;
      if (reconnectCountRef.current > MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnect attempts reached, stopping reconnection');
        return;
      }

      // Use exponential backoff: 5s, 10s, 20s
      const delay = Math.min(5000 * Math.pow(2, reconnectCountRef.current - 1), 30000);
      console.log(`Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
      reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
    };

    eventSource.onopen = () => {
      console.log('SSE connected');
      setError(null);
      // Reset reconnection counter on successful connection
      reconnectCountRef.current = 0;
    };
  }, [sessionId]);

  // Reset reconnection counter when sessionId changes
  useEffect(() => {
    reconnectCountRef.current = 0;
  }, [sessionId]);

  // Initialize
  useEffect(() => {
    fetchTodoList();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [fetchTodoList, connectSSE]);

  // Toggle collapse state
  const toggleCollapse = () => {
    if (!isPinned) {
      setIsCollapsed(!isCollapsed);
    }
  };

  // Toggle pin state
  const togglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPinned(!isPinned);
    if (!isPinned) {
      setIsCollapsed(false);
    }
  };

  // If no todo list, don't render anything
  if (!todoList && !isLoading) {
    return null;
  }

  const { title, items, progress } = todoList || {
    title: '',
    items: [],
    progress: { completed: 0, total: 0, percentage: 0 },
  };

  const isCompleted = progress.percentage === 100;

  return (
    <div
      className={`
        ${styles.todoPanel}
        ${isCollapsed && !isPinned ? styles.collapsed : ''}
        ${isPinned ? styles.pinned : ''}
      `}
    >
      {/* Header - clickable to collapse */}
      <div className={styles.todoHeader} onClick={toggleCollapse}>
        <span className={styles.todoTitle}>
          <span className={styles.todoIcon}>📋</span>
          <span>{title || 'Task List'}</span>
        </span>

        <div className={styles.todoActions}>
          {/* Progress */}
          {progress.total > 0 && (
            <span
              className={`${styles.progress} ${
                isCompleted ? styles.completed : ''
              }`}
            >
              {progress.completed}/{progress.total}
              {isCompleted && ' ✓'}
            </span>
          )}

          {/* Pin button */}
          <button
            className={`${styles.pinBtn} ${isPinned ? styles.pinned : ''}`}
            onClick={togglePin}
            title={isPinned ? 'Unpin' : 'Pin'}
          >
            {isPinned ? '📌' : '📎'}
          </button>

          {/* Collapse button */}
          {!isPinned && (
            <button className={styles.toggleBtn}>
              {isCollapsed ? '▼' : '▲'}
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {!isCollapsed && (
        <div className={styles.todoContent}>
          {/* Progress bar */}
          {progress.total > 0 && (
            <div className={styles.progressBar}>
              <div
                className={`${styles.progressBarFill} ${
                  isCompleted ? styles.completed : ''
                }`}
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          )}

          {/* Task list */}
          <div className={styles.todoItems}>
            {items.map((item) => (
              <div
                key={item.id}
                className={styles.todoItem}
                title={statusTexts[item.status]}
              >
                <span
                  className={`${styles.statusIcon} ${statusClassNames[item.status]}`}
                >
                  {statusIcons[item.status]}
                </span>

                <div className={styles.itemContent}>
                  <div
                    className={`${styles.itemDescription} ${
                      item.status === 'completed' ? styles.completed : ''
                    }`}
                  >
                    {item.description}
                  </div>

                  {/* Meta info */}
                  {(item.depends_on.length > 0 || item.notes) && (
                    <div className={styles.itemMeta}>
                      {item.depends_on.length > 0 && (
                        <span className={styles.dependsOn}>
                          📎 Depends on: {item.depends_on.join(', ')}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <div className={styles.itemNotes}>{item.notes}</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div style={{ color: '#ff4d4f', marginTop: 12, fontSize: 12 }}>
              ⚠️ Connection error, retrying...
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TodoList;
