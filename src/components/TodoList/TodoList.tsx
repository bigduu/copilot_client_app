import React, { useState } from 'react';
import { useAppStore } from '../../pages/ChatPage/store';
import {
  Card,
  List,
  Tag,
  Progress,
  Badge,
  Tooltip,
  Space,
  Typography,
  Alert,
  theme,
} from 'antd';
import {
  CheckCircleOutlined,
  SyncOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  PushpinOutlined,
  PushpinFilled,
  DownOutlined,
  RightOutlined,
  RobotOutlined,
  ToolOutlined,
  LinkOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

// Type definitions (matching backend)
export interface TodoItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  depends_on: string[];
  notes: string;
  tool_calls_count?: number;
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

// Status configuration
const statusConfig: Record<
  TodoItem['status'],
  { icon: React.ReactNode; color: string; text: string; tagColor: string }
> = {
  pending: {
    icon: <ClockCircleOutlined />,
    color: '#8c8c8c',
    text: 'Pending',
    tagColor: 'default',
  },
  in_progress: {
    icon: <SyncOutlined spin />,
    color: '#1890ff',
    text: 'In Progress',
    tagColor: 'processing',
  },
  completed: {
    icon: <CheckCircleOutlined />,
    color: '#52c41a',
    text: 'Completed',
    tagColor: 'success',
  },
  blocked: {
    icon: <ExclamationCircleOutlined />,
    color: '#ff4d4f',
    text: 'Blocked',
    tagColor: 'error',
  },
};

export const TodoList: React.FC<TodoListProps> = ({
  sessionId,
  initialCollapsed = true,
}) => {
  const { token } = theme.useToken();

  // Get from Zustand store (real-time updates via useAgentEventSubscription)
  const todoListData = useAppStore((state) => state.todoLists[sessionId]);
  const activeItemId = useAppStore((state) => state.activeItems[sessionId]);
  const evaluationState = useAppStore((state) => state.evaluationStates[sessionId]);

  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [isPinned, setIsPinned] = useState(false);

  // Use evaluation state from store
  const isEvaluating = evaluationState?.isEvaluating || false;
  const evaluationReasoning = evaluationState?.reasoning || null;

  // Transform store data to display format
  const todoList: TodoListData | null = todoListData
    ? {
        session_id: todoListData.session_id,
        title: todoListData.title,
        items: todoListData.items,
        progress: {
          completed: todoListData.items.filter((i) => i.status === 'completed').length,
          total: todoListData.items.length,
          percentage:
            todoListData.items.length > 0
              ? Math.round(
                  (todoListData.items.filter((i) => i.status === 'completed').length /
                    todoListData.items.length) *
                    100
                )
              : 0,
        },
      }
    : null;

  // If no todo list, don't render anything
  if (!todoList) {
    return null;
  }

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

  const { title, items, progress } = todoList;
  const isCompleted = progress.percentage === 100;

  return (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        borderRadius: 8,
        boxShadow: isEvaluating
          ? `0 0 0 2px ${token.colorPrimaryBorder}`
          : '0 2px 8px rgba(0, 0, 0, 0.06)',
        opacity: isCollapsed && !isPinned ? 0.9 : 1,
      }}
      styles={{
        body: {
          padding: isCollapsed ? '12px 16px' : 16,
        },
      }}
      title={
        <Space onClick={toggleCollapse} style={{ cursor: 'pointer', width: '100%' }}>
          <UnorderedListOutlined style={{ color: token.colorPrimary }} />
          <Text strong style={{ fontSize: 15 }}>
            {title || 'Task List'}
          </Text>
          {isEvaluating && (
            <Tag icon={<SyncOutlined spin />} color="processing">
              Evaluating
            </Tag>
          )}
          {!isCollapsed && progress.total > 0 && (
            <Badge
              count={`${progress.completed}/${progress.total}`}
              style={{
                backgroundColor: isCompleted ? '#52c41a' : token.colorPrimary,
              }}
            />
          )}
        </Space>
      }
      extra={
        <Space>
          {progress.total > 0 && isCollapsed && (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {progress.completed}/{progress.total}
              {isCompleted && <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 4 }} />}
            </Text>
          )}
          <Tooltip title={isPinned ? 'Unpin' : 'Pin'}>
            <span
              onClick={togglePin}
              style={{
                cursor: 'pointer',
                color: isPinned ? token.colorPrimary : token.colorTextSecondary,
                fontSize: 16,
              }}
            >
              {isPinned ? <PushpinFilled /> : <PushpinOutlined />}
            </span>
          </Tooltip>
          {!isPinned && (
            <span
              onClick={toggleCollapse}
              style={{
                cursor: 'pointer',
                color: token.colorTextSecondary,
                fontSize: 12,
                transform: isCollapsed ? 'rotate(-90deg)' : undefined,
                transition: 'transform 0.2s',
              }}
            >
              {isCollapsed ? <RightOutlined /> : <DownOutlined />}
            </span>
          )}
        </Space>
      }
    >
      {!isCollapsed && (
        <>
          {/* Evaluation reasoning banner */}
          {evaluationReasoning && (
            <Alert
              icon={<RobotOutlined />}
              message="LLM Evaluation"
              description={evaluationReasoning}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* Progress bar */}
          {progress.total > 0 && (
            <div style={{ marginBottom: 16 }}>
              <Progress
                percent={progress.percentage}
                size="small"
                status={isCompleted ? 'success' : 'active'}
                format={(percent) => <Text type="secondary">{percent}%</Text>}
              />
            </div>
          )}

          {/* Task list */}
          <List
            size="small"
            dataSource={items}
            renderItem={(item) => {
              const status = statusConfig[item.status];
              const isActive = activeItemId === item.id;

              return (
                <List.Item
                  style={{
                    padding: '12px 0',
                    borderLeft: isActive ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
                    paddingLeft: isActive ? 12 : 15,
                    backgroundColor: isActive ? token.colorPrimaryBg : 'transparent',
                    borderRadius: 4,
                    marginBottom: 4,
                  }}
                >
                  <div style={{ width: '100%' }}>
                    <Space align="start" style={{ width: '100%' }}>
                      <Tooltip title={status.text}>
                        <span style={{ color: status.color, fontSize: 16 }}>{status.icon}</span>
                      </Tooltip>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{
                            textDecoration: item.status === 'completed' ? 'line-through' : 'none',
                            color: item.status === 'completed' ? token.colorTextSecondary : token.colorText,
                            fontWeight: isActive ? 500 : 400,
                          }}
                        >
                          {item.description}
                        </Text>

                        {/* Meta info */}
                        <div style={{ marginTop: 4 }}>
                          <Space size={8} wrap>
                            <Tag color={status.tagColor}>{status.text}</Tag>

                            {/* Tool calls count */}
                            {item.tool_calls_count !== undefined && item.tool_calls_count > 0 && (
                              <Tag icon={<ToolOutlined />} color="blue">
                                {item.tool_calls_count} tools
                              </Tag>
                            )}

                            {/* Dependencies */}
                            {item.depends_on.length > 0 && (
                              <Tooltip title={`Depends on: ${item.depends_on.join(', ')}`}>
                                <Tag icon={<LinkOutlined />}>{item.depends_on.length} deps</Tag>
                              </Tooltip>
                            )}
                          </Space>
                        </div>

                        {/* Notes */}
                        {item.notes && (
                          <Text
                            type="secondary"
                            style={{
                              display: 'block',
                              marginTop: 6,
                              fontSize: 12,
                              padding: '4px 8px',
                              backgroundColor: token.colorFillQuaternary,
                              borderRadius: 4,
                            }}
                          >
                            {item.notes}
                          </Text>
                        )}
                      </div>
                    </Space>
                  </div>
                </List.Item>
              );
            }}
          />
        </>
      )}
    </Card>
  );
};

export default TodoList;
