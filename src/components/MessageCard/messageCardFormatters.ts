export const formatUserToolCall = (toolCall: string): string => {
  if (!toolCall.startsWith("/")) return toolCall;

  const parts = toolCall.split(" ");
  const toolName = parts[0].substring(1);
  const description = parts.slice(1).join(" ");

  const friendlyToolName = toolName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return `🔧 ${friendlyToolName}: ${description}`;
};
