export type TodoItemStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "failed";

export type TodoListStatus = "active" | "completed" | "abandoned";

export interface TodoItem {
  id: string;
  description: string;
  status: TodoItemStatus;
  order: number;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TodoListMsg {
  list_id: string;
  message_id: string;
  title: string;
  description?: string;
  items: TodoItem[];
  status: TodoListStatus;
  created_at: string;
  updated_at: string;
}
