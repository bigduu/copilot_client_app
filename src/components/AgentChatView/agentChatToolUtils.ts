import type { ClaudeContentPart } from "../ClaudeStream";

export const normalizeToolName = (value?: string | null): string => {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
};

export const formatMcpToolName = (
  toolName: string,
): { provider: string; method: string } => {
  const withoutPrefix = toolName.replace(/^mcp__/, "");
  const parts = withoutPrefix.split("__");
  if (parts.length >= 2) {
    const provider = parts[0]
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ");
    const method = parts
      .slice(1)
      .join("__")
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" ");
    return { provider, method };
  }
  return {
    provider: "MCP",
    method: withoutPrefix
      .replace(/_/g, " ")
      .split(" ")
      .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
      .join(" "),
  };
};

export const isAskUserQuestionTool = (
  part: Extract<ClaudeContentPart, { type: "tool_use" }>,
): boolean => normalizeToolName(part.name) === "askuserquestion";

export const toToolList = (value: any): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string") as string[];
};
