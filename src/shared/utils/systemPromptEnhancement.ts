import {
  getMermaidEnhancementPrompt,
  isMermaidEnhancementEnabled,
} from "./mermaidUtils";
import {
  getTodoEnhancementPrompt,
  isTodoEnhancementEnabled,
} from "./todoEnhancementUtils";

const SYSTEM_PROMPT_ENHANCEMENT_KEY = "bamboo_system_prompt_enhancement";

const joinPromptSegments = (segments: string[]): string => {
  const normalized = segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return normalized.join("\n\n");
};

const appendPromptSegment = (base: string, segment: string): string => {
  const normalizedBase = (base ?? "").trimEnd();
  const normalizedSegment = (segment ?? "").trim();
  if (!normalizedSegment) {
    return normalizedBase;
  }
  if (!normalizedBase) {
    return normalizedSegment;
  }
  return `${normalizedBase}\n\n${normalizedSegment}`;
};

const buildWorkspaceContextSegment = (workspacePath?: string): string => {
  const normalized = (workspacePath ?? "").trim();
  if (!normalized) {
    return "";
  }
  return [
    `Workspace path: ${normalized}`,
    "If you need to inspect files, check the workspace first, then ~/.bamboo.",
  ].join("\n");
};

export const getSystemPromptEnhancement = (): string => {
  try {
    const stored = localStorage.getItem(SYSTEM_PROMPT_ENHANCEMENT_KEY);
    return stored ?? "";
  } catch (error) {
    console.error("Failed to load system prompt enhancement:", error);
    return "";
  }
};

export const setSystemPromptEnhancement = (value: string): void => {
  try {
    const normalized = value.trim() ? value : "";
    localStorage.setItem(SYSTEM_PROMPT_ENHANCEMENT_KEY, normalized);
  } catch (error) {
    console.error("Failed to save system prompt enhancement:", error);
  }
};

export const getSystemPromptEnhancementPipeline = (): string[] => {
  const pipeline: string[] = [];
  const userEnhancement = getSystemPromptEnhancement().trim();

  if (userEnhancement) {
    pipeline.push(userEnhancement);
  }

  if (isMermaidEnhancementEnabled()) {
    pipeline.push(getMermaidEnhancementPrompt().trim());
  }

  if (isTodoEnhancementEnabled()) {
    pipeline.push(getTodoEnhancementPrompt().trim());
  }

  return pipeline;
};

export const getSystemPromptEnhancementText = (): string => {
  return joinPromptSegments(getSystemPromptEnhancementPipeline());
};

export const buildEnhancedSystemPrompt = (
  basePrompt: string,
  enhancement?: string,
): string => {
  return appendPromptSegment(basePrompt, enhancement ?? "");
};

export const getEffectiveSystemPrompt = (
  basePrompt: string,
  workspacePath?: string,
): string => {
  const enhanced = buildEnhancedSystemPrompt(
    basePrompt,
    getSystemPromptEnhancementText(),
  );
  return appendPromptSegment(
    enhanced,
    buildWorkspaceContextSegment(workspacePath),
  );
};
