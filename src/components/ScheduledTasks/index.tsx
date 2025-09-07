import React, { useState } from 'react';
import { useScheduledTasks } from '../../hooks/useScheduledTasks';
import { useTaskScheduler } from '../../hooks/useTaskScheduler';
import { NewTaskModal } from '../NewTaskModal';
import './styles.css';

// This will be our main component for managing scheduled tasks.
export const ScheduledTasks: React.FC = () => {
  const { tasks, addTask, deleteTask, updateTask } = useScheduledTasks();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Activate the scheduler with the current list of tasks
  useTaskScheduler(tasks);

  const handleCreateTask = (values: any) => {
    addTask({
      ...values,
      isEnabled: true,
    });
  };

  return (
    <>
      <div className="scheduled-tasks-container">
        <div className="tasks-header">
          <h2>Scheduled Tasks</h2>
          <button onClick={() => setIsModalOpen(true)} className="create-task-btn">
            + New Task
          </button>
        </div>
        <div className="tasks-list">
          {tasks.length === 0 ? (
            <p>No scheduled tasks yet. Click "New Task" to create one.</p>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="task-item">
                <div className="task-item-header">
                  <strong>{task.name}</strong>
                  <span>{task.schedule}s</span>
                </div>
                <p>Input: {task.naturalLanguageInput}</p>
                <code>{task.generatedScript}</code>
                <div className="task-item-actions">
                  <button onClick={() => updateTask(task.id, { isEnabled: !task.isEnabled })}>
                    {task.isEnabled ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => deleteTask(task.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <NewTaskModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreateTask}
      />
    </>
  );
};