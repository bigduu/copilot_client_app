import React from 'react';
import { TodoListMsg, TodoItem, TodoItemStatus } from '../../types/sse';
import './TodoListDisplay.css';

interface TodoListDisplayProps {
  todoList: TodoListMsg;
}

export const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todoList }) => {
  const getStatusIcon = (status: TodoItemStatus): string => {
    switch (status) {
      case 'pending':
        return '☐';
      case 'in_progress':
        return '◐';
      case 'completed':
        return '☑';
      case 'skipped':
        return '⊘';
      case 'failed':
        return '☒';
      default:
        return '☐';
    }
  };

  const getStatusClass = (status: TodoItemStatus): string => {
    return `todo-item-${status.replace('_', '-')}`;
  };

  const getListStatusClass = (status: string): string => {
    return `todo-list-${status}`;
  };

  const completionPercentage = React.useMemo(() => {
    if (todoList.items.length === 0) return 0;
    const completed = todoList.items.filter(
      (item) => item.status === 'completed'
    ).length;
    return Math.round((completed / todoList.items.length) * 100);
  }, [todoList.items]);

  const currentItem = React.useMemo(() => {
    return todoList.items.find((item) => item.status === 'in_progress');
  }, [todoList.items]);

  return (
    <div className={`todo-list-container ${getListStatusClass(todoList.status)}`}>
      {/* Header */}
      <div className="todo-list-header">
        <h3 className="todo-list-title">{todoList.title}</h3>
        {todoList.description && (
          <p className="todo-list-description">{todoList.description}</p>
        )}
      </div>

      {/* Progress Bar */}
      <div className="todo-progress-container">
        <div className="todo-progress-bar">
          <div
            className="todo-progress-fill"
            style={{ width: `${completionPercentage}%` }}
          ></div>
        </div>
        <span className="todo-progress-text">
          {completionPercentage}% Complete
        </span>
      </div>

      {/* Items List */}
      <div className="todo-items-list">
        {todoList.items.map((item) => (
          <div
            key={item.id}
            className={`todo-item ${getStatusClass(item.status)} ${
              currentItem?.id === item.id ? 'current-item' : ''
            }`}
          >
            <span className="todo-item-icon">{getStatusIcon(item.status)}</span>
            <span className="todo-item-description">{item.description}</span>
            {item.status === 'failed' && item.metadata?.error && (
              <span className="todo-item-error">⚠ {item.metadata.error}</span>
            )}
          </div>
        ))}
      </div>

      {/* Footer - Status Info */}
      <div className="todo-list-footer">
        <span className="todo-list-stats">
          {todoList.items.filter((i) => i.status === 'completed').length} /{' '}
          {todoList.items.length} tasks completed
        </span>
        {currentItem && (
          <span className="todo-current-task">
            Current: {currentItem.description}
          </span>
        )}
      </div>
    </div>
  );
};

export default TodoListDisplay;
