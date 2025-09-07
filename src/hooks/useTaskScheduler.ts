import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ScheduledTask } from './useScheduledTasks';

export const useTaskScheduler = (tasks: ScheduledTask[]) => {
  const workerRef = useRef<Worker | null>(null);
  const activeTimersRef = useRef<Record<string, number>>({});

  // Initialize worker and setup message proxy
  useEffect(() => {
    const worker = new Worker('/task-worker.js', { type: 'module' });
    workerRef.current = worker;

    const messageHandler = (event: MessageEvent) => {
      console.log('[Scheduler] Message from worker:', event.data);
      const { type, payload, messageId } = event.data;

      if (type === 'invoke') {
        console.log(`[Scheduler] Invoking command for worker: ${payload.command}`);
        invoke(payload.command, payload.args)
          .then(result => {
            worker.postMessage({ type: 'invokeResult', messageId, result });
          })
          .catch(error => {
            console.error(`[Scheduler] Error invoking command ${payload.command}:`, error);
            worker.postMessage({ type: 'invokeResult', messageId, error: error.toString() });
          });
      }
    };

    worker.addEventListener('message', messageHandler);

    return () => {
      worker.removeEventListener('message', messageHandler);
      worker.terminate();
      // Clear all timers on unmount
      Object.values(activeTimersRef.current).forEach(clearInterval);
    };
  }, []);

  // This effect syncs timers with the tasks list
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker) return;

    const activeTimerIds = Object.keys(activeTimersRef.current);
    const enabledTaskIds = tasks.filter(t => t.isEnabled).map(t => t.id);

    // Clear timers for disabled or deleted tasks
    activeTimerIds.forEach(taskId => {
      if (!enabledTaskIds.includes(taskId)) {
        console.log(`[Scheduler] Clearing timer for task ${taskId}`);
        clearInterval(activeTimersRef.current[taskId]);
        delete activeTimersRef.current[taskId];
      }
    });

    // Create timers for new or enabled tasks
    enabledTaskIds.forEach(taskId => {
      if (!activeTimerIds.includes(taskId)) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          // For now, treat schedule as seconds. A proper cron parser would be needed.
          const interval = parseInt(task.schedule, 10) * 1000;
          if (!isNaN(interval) && interval > 0) {
            console.log(`[Scheduler] Creating timer for task ${taskId} every ${interval}ms`);
            const timerId = setInterval(() => {
              console.log(`[Scheduler] Executing task ${task.id}`);
              worker.postMessage({ script: task.generatedScript });
            }, interval);
            activeTimersRef.current[taskId] = timerId as any;
          }
        }
      }
    });

  }, [tasks]);
};