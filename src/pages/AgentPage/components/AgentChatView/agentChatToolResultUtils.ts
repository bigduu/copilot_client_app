type TreeNode = {
  name: string;
  type: "file" | "directory";
  children: TreeNode[];
};

export const parseDirectoryTree = (rawContent: string): TreeNode[] => {
  const lines = rawContent.split("\n");
  const roots: TreeNode[] = [];
  const stack: Array<{ level: number; node: TreeNode }> = [];

  for (const line of lines) {
    if (line.startsWith("NOTE:")) break;
    if (!line.trim()) continue;
    const indentMatch = line.match(/^(\s*)/)?.[1] ?? "";
    const level = Math.floor(indentMatch.length / 2);
    const entryMatch = line.match(/^\s*-\s+(.+?)(\/$)?$/);
    if (!entryMatch) continue;
    const fullName = entryMatch[1];
    const isDirectory = line.trim().endsWith("/");
    const node: TreeNode = {
      name: fullName,
      type: isDirectory ? "directory" : "file",
      children: [],
    };

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    if (stack.length) {
      stack[stack.length - 1].node.children.push(node);
    } else {
      roots.push(node);
    }
    if (isDirectory) {
      stack.push({ level, node });
    }
  }

  return roots;
};

export const parseNumberedCode = (
  rawContent: string,
): { code: string; startLine: number } => {
  const lines = rawContent.split("\n");
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  if (!nonEmpty.length) {
    return { code: rawContent, startLine: 1 };
  }

  const numberedLines = nonEmpty.filter((line) => /^\s*\d+→/.test(line)).length;
  const likelyNumbered = numberedLines / nonEmpty.length > 0.5;
  if (!likelyNumbered) {
    return { code: rawContent, startLine: 1 };
  }

  const codeLines: string[] = [];
  let minLine = Number.POSITIVE_INFINITY;

  for (const rawLine of lines) {
    const trimmed = rawLine.trimStart();
    const match = trimmed.match(/^(\d+)→(.*)$/);
    if (match) {
      const lineNumber = parseInt(match[1], 10);
      if (minLine === Number.POSITIVE_INFINITY) {
        minLine = lineNumber;
      }
      codeLines.push(match[2]);
    } else if (rawLine.trim() === "") {
      codeLines.push("");
    } else {
      codeLines.push("");
    }
  }

  while (codeLines.length && codeLines[codeLines.length - 1] === "") {
    codeLines.pop();
  }

  return {
    code: codeLines.join("\n"),
    startLine: minLine === Number.POSITIVE_INFINITY ? 1 : minLine,
  };
};

export const parseEditResult = (
  rawContent: string,
): { filePath: string; code: string; startLine: number } | null => {
  const lines = rawContent.split("\n");
  let filePath = "";
  const codeLines: string[] = [];
  let minLine = Number.POSITIVE_INFINITY;
  let inCode = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (line.includes("The file") && line.includes("has been updated")) {
      const match = line.match(/The file (.+) has been updated/);
      if (match) {
        filePath = match[1];
      }
      continue;
    }
    const match =
      line.match(/^\s*(\d+)→(.*)$/) || line.match(/^\s*(\d+)\t?(.*)$/);
    if (match) {
      inCode = true;
      const lineNumber = parseInt(match[1], 10);
      if (minLine === Number.POSITIVE_INFINITY) {
        minLine = lineNumber;
      }
      codeLines.push(match[2]);
      continue;
    }
    if (inCode) {
      if (line.trim() === "") {
        codeLines.push("");
      }
    }
  }

  if (!codeLines.length) return null;
  return {
    filePath,
    code: codeLines.join("\n"),
    startLine: minLine === Number.POSITIVE_INFINITY ? 1 : minLine,
  };
};

export const parseMultiEditResult = (
  rawContent: string,
): Array<{ filePath: string; code: string; startLine: number }> => {
  const sections: Array<{ filePath: string; code: string; startLine: number }> =
    [];
  const lines = rawContent.split("\n");
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (!currentBlock.length) return;
    const blockContent = currentBlock.join("\n");
    const parsed = parseEditResult(blockContent);
    if (parsed) {
      sections.push(parsed);
    }
    currentBlock = [];
  };

  for (const line of lines) {
    if (line.includes("The file") && line.includes("has been updated")) {
      flushBlock();
    }
    currentBlock.push(line);
  }
  flushBlock();
  return sections;
};

export const getToolResultText = (value: any): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof (value as any).result === "string") return (value as any).result;
    if (typeof (value as any).output === "string") return (value as any).output;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};
