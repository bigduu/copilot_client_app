import { describe, expect, it } from "vitest";
import { getDefaultSystemPrompts } from "../defaultSystemPrompts";

describe("defaultSystemPrompts", () => {
  it("returns a default prompt with content", () => {
    const prompts = getDefaultSystemPrompts();
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts[0].content).toBeTruthy();
  });
});
