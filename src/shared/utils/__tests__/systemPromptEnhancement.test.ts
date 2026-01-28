import { beforeEach, describe, expect, it } from "vitest";
import {
  buildEnhancedSystemPrompt,
  getSystemPromptEnhancement,
  getSystemPromptEnhancementText,
  setSystemPromptEnhancement,
} from "../systemPromptEnhancement";
import {
  getMermaidEnhancementPrompt,
  setMermaidEnhancementEnabled,
} from "../mermaidUtils";
import {
  getTodoEnhancementPrompt,
  setTodoEnhancementEnabled,
} from "../todoEnhancementUtils";

describe("systemPromptEnhancement", () => {
  beforeEach(() => {
    localStorage.clear();
    setMermaidEnhancementEnabled(false);
    setTodoEnhancementEnabled(false);
  });

  it("returns base prompt when enhancement is empty", () => {
    const result = buildEnhancedSystemPrompt("Base prompt", "");
    expect(result).toBe("Base prompt");
  });

  it("returns enhancement when base prompt is empty", () => {
    const result = buildEnhancedSystemPrompt("", "Extra prompt");
    expect(result).toBe("Extra prompt");
  });

  it("joins base and enhancement with a blank line", () => {
    const result = buildEnhancedSystemPrompt("Base prompt", "Extra prompt");
    expect(result).toBe("Base prompt\n\nExtra prompt");
  });

  it("persists enhancement content", () => {
    setSystemPromptEnhancement("Enhanced guidance");
    expect(getSystemPromptEnhancement()).toBe("Enhanced guidance");
  });

  it("clears enhancement when value is whitespace", () => {
    setSystemPromptEnhancement("Enhanced guidance");
    setSystemPromptEnhancement("   ");
    expect(getSystemPromptEnhancement()).toBe("");
  });

  it("omits mermaid fallback from user enhancement", () => {
    setMermaidEnhancementEnabled(true);
    expect(getSystemPromptEnhancement()).toBe("");
  });

  it("builds enhancement text with user and system prompts in order", () => {
    setSystemPromptEnhancement("User enhancement");
    setMermaidEnhancementEnabled(true);
    setTodoEnhancementEnabled(true);

    expect(getSystemPromptEnhancementText()).toBe(
      [
        "User enhancement",
        getMermaidEnhancementPrompt().trim(),
        getTodoEnhancementPrompt().trim(),
      ].join("\n\n"),
    );
  });

  it("returns only enabled system enhancements when user text is empty", () => {
    setTodoEnhancementEnabled(true);

    expect(getSystemPromptEnhancementText()).toBe(
      getTodoEnhancementPrompt().trim(),
    );
  });
});
