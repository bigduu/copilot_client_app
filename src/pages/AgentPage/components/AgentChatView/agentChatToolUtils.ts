import type { ClaudeContentPart } from "../ClaudeStream";

export const normalizeToolName = (value?: string | null): string => {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const isAskUserQuestionTool = (
  part: Extract<ClaudeContentPart, { type: "tool_use" }>,
): boolean => normalizeToolName(part.name) === "askuserquestion";

export const toToolList = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string") as string[];
};
