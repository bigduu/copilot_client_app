// Workflow and file reference input highlighting utilities
// Provides parsing logic to identify segments like `/workflowName` and `@file`
// Returns segments that can be rendered with conditional styling in the input overlay.

export type HighlightSegment = {
  text: string;
  type: "workflow" | "file" | "text";
};

const isWhitespace = (char: string) => /\s/.test(char);

export const getInputHighlightSegments = (
  value: string,
): HighlightSegment[] => {
  if (!value) {
    return [{ text: "", type: "text" }];
  }

  const segments: HighlightSegment[] = [];
  const length = value.length;
  let index = 0;

  while (index < length) {
    const char = value[index];
    const prevChar = index > 0 ? value[index - 1] : "";

    const isCommandTrigger =
      char === "/" && (index === 0 || isWhitespace(prevChar));
    const isFileTrigger =
      char === "@" && (index === 0 || isWhitespace(prevChar));

    if (!isCommandTrigger && !isFileTrigger) {
      let start = index;
      while (
        index < length &&
        !(
          (value[index] === "/" || value[index] === "@") &&
          (index === 0 || isWhitespace(value[index - 1]))
        )
      ) {
        index += 1;
      }
      segments.push({ text: value.slice(start, index), type: "text" });
      continue;
    }

    let end = index + 1;
    while (end < length && !isWhitespace(value[end])) {
      end += 1;
    }

    const token = value.slice(index, end);

    if (isCommandTrigger) {
      const isStandalone = end === length || isWhitespace(value[end]);
      if (isStandalone) {
        segments.push({ text: token, type: "workflow" });
      } else {
        segments.push({ text: token, type: "text" });
      }
    } else if (isFileTrigger) {
      segments.push({ text: token, type: "file" });
    }

    index = end;
  }

  return segments.length > 0 ? segments : [{ text: "", type: "text" }];
};

export interface WorkflowCommandInfo {
  command: string | null;
  isTriggerActive: boolean;
  searchText: string;
}

const WORKFLOW_TRIGGER_REGEX = /(\/)([a-zA-Z0-9_-]*)$/;

export const getWorkflowCommandInfo = (value: string): WorkflowCommandInfo => {
  if (!value) {
    return { command: null, isTriggerActive: false, searchText: "" };
  }

  const match = value.match(WORKFLOW_TRIGGER_REGEX);
  if (!match) {
    return { command: null, isTriggerActive: false, searchText: "" };
  }

  const rawCommand = match[2] || "";
  const isTriggerActive =
    !rawCommand.includes(" ") && match.index !== undefined;

  return {
    command: rawCommand || null,
    isTriggerActive,
    searchText: rawCommand,
  };
};

export interface FileReferenceInfo {
  isTriggerActive: boolean;
  searchText: string;
  tokenStart: number | null;
}

const FILE_REFERENCE_PATTERN = /@([a-zA-Z0-9._\-\/\\]*)$/;

export const getFileReferenceInfo = (value: string): FileReferenceInfo => {
  if (!value) {
    return { isTriggerActive: false, searchText: "", tokenStart: null };
  }

  const match = value.match(FILE_REFERENCE_PATTERN);
  if (!match || match.index === undefined) {
    return { isTriggerActive: false, searchText: "", tokenStart: null };
  }

  const search = match[1] || "";
  const tokenStart = match.index;

  const isTriggerActive = !search.includes(" ");

  return {
    isTriggerActive,
    searchText: search,
    tokenStart,
  };
};
