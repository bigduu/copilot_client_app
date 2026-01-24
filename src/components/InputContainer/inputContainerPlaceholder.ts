export const getInputContainerPlaceholder = ({
  referenceText,
  isToolSpecificMode,
  isRestrictConversation,
  allowedTools,
  autoToolPrefix,
}: {
  referenceText: string | null;
  isToolSpecificMode: boolean;
  isRestrictConversation: boolean;
  allowedTools: string[];
  autoToolPrefix?: string;
}) => {
  if (referenceText) {
    return "Send a message (includes reference)";
  }

  if (isToolSpecificMode) {
    if (isRestrictConversation) {
      return `Tool calls only (allowed tools: ${allowedTools.join(", ")})`;
    }
    if (autoToolPrefix) {
      return `Auto-prefix mode: ${autoToolPrefix} (type '/' to select tools)`;
    }
    return `Tool-specific mode (allowed tools: ${allowedTools.join(", ")})`;
  }

  return "Send a message... (type '/' for workflows)";
};
