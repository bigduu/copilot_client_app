import type {
  AssistantToolCallMessage,
  AssistantToolResultMessage,
  AssistantTodoListMessage,
  Message,
  ToolExecutionResult,
  UserFileReferenceMessage,
  WorkflowResultMessage,
} from "./chatMessages";

export const isToolExecutionResult = (obj: any): obj is ToolExecutionResult => {
  return (
    obj &&
    typeof obj.result === "string" &&
    typeof obj.display_preference === "string"
  );
};

export const isAssistantToolResultMessage = (
  message: Message,
): message is AssistantToolResultMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "tool_result"
  );
};

export const isAssistantToolCallMessage = (
  message: Message,
): message is AssistantToolCallMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "tool_call"
  );
};

export const isWorkflowResultMessage = (
  message: Message,
): message is WorkflowResultMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "workflow_result"
  );
};

export const isUserFileReferenceMessage = (
  message: Message,
): message is UserFileReferenceMessage => {
  return (
    message.role === "user" &&
    "type" in message &&
    message.type === "file_reference"
  );
};

export const isTodoListMessage = (
  message: Message,
): message is AssistantTodoListMessage => {
  return (
    message.role === "assistant" &&
    "type" in message &&
    message.type === "todo_list"
  );
};
