import { StateCreator } from 'zustand';

// Todo item status
export type TodoItemStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

// Todo item
export interface TodoItem {
  id: string;
  description: string;
  status: TodoItemStatus;
  depends_on: string[];
  notes: string;
  tool_calls_count?: number; // NEW: number of tool calls
}

// Todo list
export interface TodoList {
  session_id: string;
  title: string;
  items: TodoItem[];
  created_at: string;
  updated_at: string;
  version?: number;
}

// Progress info
export interface TodoProgress {
  completed: number;
  total: number;
  percentage: number;
}

// Delta update for real-time progress
export interface TodoListDelta {
  session_id: string;
  item_id: string;
  status: TodoItemStatus;
  tool_calls_count: number;
  version: number;
}

export interface TodoListState {
  // Map of session ID to todo list
  todoLists: Record<string, TodoList>;
  // Map of session ID to version (for conflict detection)
  todoListVersions: Record<string, number>;
  // Map of session ID to active item ID
  activeItems: Record<string, string | null>;
  // Map of session ID to evaluation state (NEW)
  evaluationStates: Record<string, EvaluationState>;
}

// Evaluation state (NEW)
export interface EvaluationState {
  isEvaluating: boolean;
  reasoning: string | null;
  timestamp: number | null;
}

export interface TodoListActions {
  // Set full todo list (from TodoListUpdated event)
  setTodoList: (sessionId: string, todoList: TodoList) => void;
  // Update from delta (from TodoListItemProgress event)
  updateTodoListDelta: (sessionId: string, delta: TodoListDelta) => void;
  // Clear todo list for a session
  clearTodoList: (sessionId: string) => void;
  // Get current version
  getTodoListVersion: (sessionId: string) => number;
  // Set evaluation state (NEW)
  setEvaluationState: (sessionId: string, state: EvaluationState) => void;
  // Clear evaluation state (NEW)
  clearEvaluationState: (sessionId: string) => void;
}

export type TodoListSlice = TodoListState & TodoListActions;

export const createTodoListSlice: StateCreator<
  TodoListSlice,
  [],
  [],
  TodoListSlice
> = (set, get) => ({
  // State
  todoLists: {},
  todoListVersions: {},
  activeItems: {},
  evaluationStates: {},

  // Set full todo list (from TodoListUpdated event)
  setTodoList: (sessionId, todoList) =>
    set((state) => ({
      todoLists: {
        ...state.todoLists,
        [sessionId]: todoList,
      },
      todoListVersions: {
        ...state.todoListVersions,
        [sessionId]: todoList.version || 0,
      },
    })),

  // Update from delta (from TodoListItemProgress event)
  updateTodoListDelta: (sessionId, delta) =>
    set((state) => {
      const currentVersion = state.todoListVersions[sessionId] || 0;

      // Ignore outdated updates
      if (delta.version <= currentVersion) {
        return state;
      }

      const currentList = state.todoLists[sessionId];
      if (!currentList) {
        // No existing list, ignore delta
        return state;
      }

      // Update specific item
      const updatedItems = currentList.items.map((item) =>
        item.id === delta.item_id
          ? {
              ...item,
              status: delta.status,
              tool_calls_count: delta.tool_calls_count,
            }
          : item
      );

      return {
        todoLists: {
          ...state.todoLists,
          [sessionId]: {
            ...currentList,
            items: updatedItems,
            updated_at: new Date().toISOString(),
          },
        },
        todoListVersions: {
          ...state.todoListVersions,
          [sessionId]: delta.version,
        },
        activeItems: {
          ...state.activeItems,
          [sessionId]: delta.status === 'in_progress' ? delta.item_id : null,
        },
      };
    }),

  // Clear todo list for a session
  clearTodoList: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...remainingTodoLists } = state.todoLists;
      const { [sessionId]: __, ...remainingVersions } = state.todoListVersions;
      const { [sessionId]: ___, ...remainingActive } = state.activeItems;
      const { [sessionId]: ____, ...remainingEvaluations } = state.evaluationStates;
      return {
        todoLists: remainingTodoLists,
        todoListVersions: remainingVersions,
        activeItems: remainingActive,
        evaluationStates: remainingEvaluations,
      };
    }),

  // Get current version
  getTodoListVersion: (sessionId) => {
    return get().todoListVersions[sessionId] || 0;
  },

  // Set evaluation state (NEW)
  setEvaluationState: (sessionId, evalState) =>
    set((state) => ({
      evaluationStates: {
        ...state.evaluationStates,
        [sessionId]: evalState,
      },
    })),

  // Clear evaluation state (NEW)
  clearEvaluationState: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...remainingEvaluations } = state.evaluationStates;
      return {
        evaluationStates: remainingEvaluations,
      };
    }),
});
