import { ExecutionStatus } from "../types/chat";

export interface FormattedResult {
  isJson: boolean;
  formattedText: string;
  parsedJson?: unknown;
}

export interface CollapseOptions {
  maxLines?: number;
  maxCharacters?: number;
}

const DEFAULT_COLLAPSE_OPTIONS: Required<CollapseOptions> = {
  maxLines: 18,
  maxCharacters: 2_000,
};

/**
 * Recursively process JSON values to convert escaped newlines to actual newlines
 */
const unescapeJsonStrings = (value: unknown): unknown => {
  if (typeof value === "string") {
    // Replace literal \n with actual newlines
    return value.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
  }
  if (Array.isArray(value)) {
    return value.map(unescapeJsonStrings);
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = unescapeJsonStrings(val);
    }
    return result;
  }
  return value;
};

/**
 * Try to parse JSON content and return formatted output with metadata.
 */
export const formatResultContent = (content: string): FormattedResult => {
  if (!content) {
    return {
      isJson: false,
      formattedText: "",
    };
  }

  const trimmed = content.trim();

  if (!trimmed) {
    return {
      isJson: false,
      formattedText: "",
    };
  }

  // Quick heuristic to avoid JSON.parse on plain text
  if (!(trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    if (!(trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      return {
        isJson: false,
        formattedText: content,
      };
    }
  }

  try {
    const parsed = JSON.parse(trimmed);

    // Check if this is a simple object with a single "content" or "result" field
    // that contains the actual text content
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.keys(parsed).length === 1
    ) {
      const key = Object.keys(parsed)[0];
      if (
        (key === "content" || key === "result" || key === "output") &&
        typeof parsed[key] === "string"
      ) {
        // This is likely a wrapped text content, extract and unescape it
        const textContent = parsed[key] as string;
        const unescaped = textContent
          .replace(/\\n/g, "\n")
          .replace(/\\t/g, "\t");
        return {
          isJson: false, // Treat as plain text for better display
          formattedText: unescaped,
          parsedJson: parsed,
        };
      }
    }

    // For complex JSON, unescape strings recursively
    const unescaped = unescapeJsonStrings(parsed);
    return {
      isJson: true,
      formattedText: JSON.stringify(unescaped, null, 2),
      parsedJson: unescaped,
    };
  } catch (error) {
    // Fall back to original content if parsing fails
    return {
      isJson: false,
      formattedText: content,
    };
  }
};

/**
 * Determine whether a block of content should be collapsed by default.
 */
export const shouldCollapseContent = (
  content: string,
  options: CollapseOptions = {},
): boolean => {
  const config: Required<CollapseOptions> = {
    ...DEFAULT_COLLAPSE_OPTIONS,
    ...options,
  };

  if (!content) {
    return false;
  }

  const lineCount = content.split(/\r?\n/).length;
  if (lineCount > config.maxLines) {
    return true;
  }

  return content.length > config.maxCharacters;
};

/**
 * Generate a truncated preview snippet for large payloads.
 */
export const createContentPreview = (
  content: string,
  maxLength = 320,
): { preview: string; isTruncated: boolean } => {
  if (!content) {
    return { preview: "", isTruncated: false };
  }

  if (content.length <= maxLength) {
    return { preview: content, isTruncated: false };
  }

  return {
    preview: content.substring(0, maxLength).trimEnd() + "…",
    isTruncated: true,
  };
};

/**
 * Map execution status to Ant Design friendly colors.
 */
export const getStatusColor = (status: ExecutionStatus): string => {
  switch (status) {
    case "success":
      return "green";
    case "error":
      return "red";
    case "warning":
      return "orange";
    default:
      return "blue";
  }
};

/**
 * Normalize stringified JSON payloads for clipboard usage.
 */
export const safeStringify = (value: unknown, spacing = 2): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, spacing);
  } catch (error) {
    console.error("[resultFormatters] Failed to stringify value:", error);
    return String(value);
  }
};
