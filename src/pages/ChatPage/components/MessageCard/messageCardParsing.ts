import type {
  Message,
  MessageType,
  PlanMessage,
  QuestionMessage,
} from "../../types/chat";

const extractJsonFromText = (text: string): string | null => {
  if (text.includes("```json")) {
    const start = text.indexOf("```json") + 7;
    const end = text.indexOf("```", start);
    if (end > start) {
      return text.substring(start, end).trim();
    }
  } else if (text.includes("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (end > start) {
      return text.substring(start, end + 1).trim();
    }
  }
  return null;
};

const isMessageType = (value: unknown): value is MessageType =>
  value === "text" ||
  value === "plan" ||
  value === "question" ||
  value === "tool_call" ||
  value === "tool_result";

export const detectMessageType = (
  message: Message,
  messageType?: "text" | "plan" | "question" | "tool_call" | "tool_result",
): "text" | "plan" | "question" | "tool_call" | "tool_result" => {
  if (messageType) return messageType;

  if ("message_type" in message && message.message_type) {
    const candidate = (message as any).message_type;
    if (isMessageType(candidate)) {
      return candidate;
    }
  }

  if (message.role === "assistant" && message.type === "text") {
    const text = typeof message.content === "string" ? message.content : "";
    try {
      const jsonStr = extractJsonFromText(text);
      if (jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (parsed.goal && parsed.steps && Array.isArray(parsed.steps)) {
          return "plan";
        }
        if (parsed.type === "question" && parsed.question) {
          return "question";
        }
      }
    } catch {
      return "text";
    }
  }

  return "text";
};

export const parsePlanMessage = (
  message: Message,
  detectedMessageType: string,
): PlanMessage | null => {
  if (
    detectedMessageType !== "plan" ||
    message.role !== "assistant" ||
    message.type !== "text"
  ) {
    return null;
  }

  const text = message.content ?? "";
  try {
    const jsonStr = extractJsonFromText(text);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.goal && parsed.steps) {
        return {
          goal: parsed.goal,
          steps: parsed.steps.map((step: any) => ({
            step_number: step.step_number || step.stepNumber || 0,
            action: step.action || "",
            reason: step.reason || step.rationale || "",
            tools_needed: step.tools_needed || step.tools || [],
            estimated_time: step.estimated_time || step.estimatedTime || "",
          })),
          estimated_total_time:
            parsed.estimated_total_time || parsed.estimatedTotalTime || "",
          risks: parsed.risks || [],
          prerequisites: parsed.prerequisites || [],
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse plan:", e);
  }
  return null;
};

export const parseQuestionMessage = (
  message: Message,
  detectedMessageType: string,
): QuestionMessage | null => {
  if (
    detectedMessageType !== "question" ||
    message.role !== "assistant" ||
    message.type !== "text"
  ) {
    return null;
  }

  const text = message.content ?? "";
  try {
    const jsonStr = extractJsonFromText(text);
    if (jsonStr) {
      const parsed = JSON.parse(jsonStr);
      if (parsed.type === "question" && parsed.question) {
        return {
          type: "question",
          question: parsed.question,
          context: parsed.context || "",
          severity: parsed.severity || "minor",
          options: parsed.options || [],
          default: parsed.default,
          allow_custom: parsed.allow_custom || false,
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse question:", e);
  }
  return null;
};

export const getMessageText = (message: Message): string => {
  if (message.role === "system") {
    return typeof message.content === "string" ? message.content : "";
  }
  if (message.role === "user") {
    if ("type" in message && message.type === "file_reference") {
      return "";
    }
    return typeof message.content === "string" ? message.content : "";
  }
  if (message.role === "assistant") {
    if (message.type === "text") {
      return typeof message.content === "string" ? message.content : "";
    }
    if (message.type === "tool_result") {
      return `Tool ${message.toolName} Result: ${message.result.result}`;
    }
    if (message.type === "tool_call") {
      return `Requesting to call ${message.toolCalls
        .map((tc) => tc.toolName)
        .join(", ")}`;
    }
    if (message.type === "workflow_result") {
      return message.content;
    }
  }
  return "";
};
