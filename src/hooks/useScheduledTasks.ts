import { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const TASKS_STORAGE_KEY = 'copilot_scheduled_tasks';

export interface ScheduledTask {
  id: string;
  name: string;
  naturalLanguageInput: string;
  generatedScript: string;
  schedule: string; // e.g., cron string or a simple interval
  createdAt: number;
  isEnabled: boolean;
}

export const useScheduledTasks = () => {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Effect to load tasks from localStorage on initial mount
  useEffect(() => {
    try {
      const storedTasks = localStorage.getItem(TASKS_STORAGE_KEY);
      if (storedTasks) {
        setTasks(JSON.parse(storedTasks));
      }
    } catch (error) {
      console.error("Failed to load tasks from localStorage", error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Effect to save tasks to localStorage whenever they change
  useEffect(() => {
    // Only save if tasks have been loaded from storage
    if (isLoaded) {
      try {
        localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      } catch (error) {
        console.error("Failed to save tasks to localStorage", error);
      }
    }
  }, [tasks, isLoaded]);

  const addTask = (taskData: Omit<ScheduledTask, 'id' | 'createdAt'>) => {
    const newTask: ScheduledTask = {
      id: uuidv4(),
      createdAt: Date.now(),
      ...taskData,
    };
    setTasks(prevTasks => [...prevTasks, newTask]);
  };

  const updateTask = (taskId: string, updates: Partial<ScheduledTask>) => {
    setTasks(prevTasks =>
      prevTasks.map(task =>
        task.id === taskId ? { ...task, ...updates } : task
      )
    );
  };

  const deleteTask = (taskId: string) => {
    setTasks(prevTasks => prevTasks.filter(task => task.id !== taskId));
  };

  return { tasks, addTask, updateTask, deleteTask };
};