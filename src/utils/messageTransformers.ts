import type { MessageDTO } from "../services/BackendContextService";
import type {
  AssistantTextMessage,
  AssistantToolCallMessage,
  AssistantToolResultMessage,
  DisplayPreference,
  ExecutionStatus,
  Message,
  SystemMessage,
  UserMessage,
  WorkflowResultMessage,
} from "../types/chat";

/**
 * Generates a timestamp compatible with the chat message schema.
 * Keeping this isolated simplifies testing message conversion helpers.
 */
const createTimestamp = () => new Date().toISOString();

/**
 * Safely converts tool execution output into a human-readable string. Nested
 * objects are expanded with JSON indentation so syntax highlighting stays
 * consistent across the UI.
 */
export const stringifyResultValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.warn(
      "[messageTransformers] Failed to stringify tool result",
      error,
    );
    return String(value);
  }
};

/** Normalises the backend display preference into the UI union. */
export const normalizeDisplayPreference = (
  preference: any,
): DisplayPreference => {
  if (preference === "Collapsible") return "Collapsible";
  if (preference === "Hidden") return "Hidden";
  return "Default";
};

/** Converts raw execution status strings to the strongly typed UI variant. */
export const normalizeExecutionStatus = (status: any): ExecutionStatus => {
  const normalized = String(status || "success").toLowerCase();
  if (normalized === "error") return "error";
  if (normalized === "warning") return "warning";
  return "success";
};

/**
 * Converts a backend {@link MessageDTO} into the strongly typed frontend
 * {@link Message} union, handling tool results, workflow outputs and tool call
 * metadata in one place.
 */
export const transformMessageDTOToMessage = (dto: MessageDTO): Message => {
  const baseContent =
    dto.content
      .map((entry) => {
        if (entry.type === "text") return entry.text;
        if (entry.type === "image") return entry.url;
        return "";
      })
      .join("\n") || "";

  const roleLower = dto.role.toLowerCase();
  const messageTypeLower =
    typeof dto.message_type === "string"
      ? dto.message_type.toLowerCase()
      : undefined;

  if (roleLower === "user") {
    const message: UserMessage = {
      id: dto.id,
      role: "user",
      content: baseContent,
      createdAt: createTimestamp(),
    };
    return message;
  }

  if (roleLower === "system") {
    const message: SystemMessage = {
      id: dto.id,
      role: "system",
      content: baseContent,
      createdAt: createTimestamp(),
    };
    return message;
  }

  if (dto.tool_result || messageTypeLower === "tool_result") {
    const toolResultData: any = dto.tool_result || {};
    const derivedToolName =
      toolResultData.tool_name ||
      toolResultData.name ||
      (dto.tool_calls && dto.tool_calls[0]?.tool_name) ||
      (dto as any).tool_name ||
      "Tool";
    const displayPreference = normalizeDisplayPreference(
      toolResultData.display_preference,
    );

    const toolResultMessage: AssistantToolResultMessage = {
      id: dto.id,
      role: "assistant",
      type: "tool_result",
      toolName: derivedToolName,
      toolCallId:
        toolResultData.request_id || toolResultData.tool_call_id || dto.id,
      result: {
        tool_name: derivedToolName,
        result: stringifyResultValue(toolResultData.result ?? baseContent),
        display_preference: displayPreference,
      },
      isError: Boolean(
        toolResultData.is_error ?? toolResultData.error ?? false,
      ),
      createdAt: createTimestamp(),
    };

    return toolResultMessage;
  }

  if (messageTypeLower === "workflow_result") {
    const metadata: any = (dto as any).metadata || {};
    const workflowName =
      metadata.workflowName ||
      metadata.workflow_name ||
      (dto as any).workflow_name ||
      "Workflow";
    const workflowParameters =
      metadata.parameters || (dto as any).workflow_parameters || null;
    const workflowStatus = normalizeExecutionStatus(
      metadata.status || (dto as any).status,
    );

    const workflowMessage: WorkflowResultMessage = {
      id: dto.id,
      role: "assistant",
      type: "workflow_result",
      workflowName,
      parameters: workflowParameters,
      status: workflowStatus,
      content: baseContent,
      createdAt: createTimestamp(),
    };

    return workflowMessage;
  }

  if (dto.tool_calls && dto.tool_calls.length > 0) {
    const message: AssistantToolCallMessage = {
      id: dto.id,
      role: "assistant",
      type: "tool_call",
      toolCalls: dto.tool_calls.map((tc) => ({
        toolCallId: tc.id,
        toolName: tc.tool_name,
        parameters: tc.arguments,
      })),
      createdAt: createTimestamp(),
    };

    return message;
  }

  if (roleLower === "tool") {
    const message: AssistantTextMessage = {
      id: dto.id,
      role: "assistant",
      type: "text",
      content: `[Tool Result]\n${baseContent}`,
      createdAt: createTimestamp(),
    };
    return message;
  }

  const message: AssistantTextMessage = {
    id: dto.id,
    role: "assistant",
    type: "text",
    content: baseContent,
    createdAt: createTimestamp(),
  };

  return message;
};
