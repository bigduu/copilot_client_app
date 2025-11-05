import { describe, expect, it } from "vitest";

import {
  FileReferenceInfo,
  WorkflowCommandInfo,
  getFileReferenceInfo,
  getInputHighlightSegments,
  getWorkflowCommandInfo,
} from "../inputHighlight";

describe("getInputHighlightSegments", () => {
  it("identifies workflow commands and file references", () => {
    const value = "/run-analysis project @src/index.ts continue";
    const segments = getInputHighlightSegments(value);

    expect(segments).toEqual([
      { text: "/run-analysis", type: "workflow" },
      { text: " project ", type: "text" },
      { text: "@src/index.ts", type: "file" },
      { text: " continue", type: "text" },
    ]);
  });

  it("returns a default segment for empty strings", () => {
    expect(getInputHighlightSegments("")).toEqual([{ text: "", type: "text" }]);
  });
});

describe("getWorkflowCommandInfo", () => {
  it("activates trigger when caret is after slash", () => {
    const info: WorkflowCommandInfo = getWorkflowCommandInfo("Run /deploy");
    expect(info.isTriggerActive).toBe(true);
    expect(info.command).toBe("deploy");
    expect(info.searchText).toBe("deploy");
  });

  it("resets trigger when whitespace follows command", () => {
    const info = getWorkflowCommandInfo("/deploy now");
    expect(info.isTriggerActive).toBe(false);
    expect(info.command).toBeNull();
  });
});

describe("getFileReferenceInfo", () => {
  it("detects active file reference tokens", () => {
    const info: FileReferenceInfo = getFileReferenceInfo("Open @src/utils");
    expect(info.isTriggerActive).toBe(true);
    expect(info.searchText).toBe("src/utils");
    expect(info.tokenStart).toBe(5);
  });

  it("ignores tokens containing spaces", () => {
    const info = getFileReferenceInfo("@not valid");
    expect(info.isTriggerActive).toBe(false);
    expect(info.searchText).toBe("");
    expect(info.tokenStart).toBeNull();
  });
});
