import { describe, expect, it } from "vitest";

import {
  createContentPreview,
  formatResultContent,
  getStatusColor,
  safeStringify,
  shouldCollapseContent,
} from "../resultFormatters";

describe("formatResultContent", () => {
  it("parses valid JSON payloads", () => {
    const payload = JSON.stringify({ hello: "world", count: 1 });
    const result = formatResultContent(payload);

    expect(result.isJson).toBe(true);
    expect(result.formattedText).toContain('\n  "hello": "world"');
    expect(result.parsedJson).toEqual({ hello: "world", count: 1 });
  });

  it("returns plain text when JSON parsing fails", () => {
    const payload = "{not: 'json'}";
    const result = formatResultContent(payload);

    expect(result.isJson).toBe(false);
    expect(result.formattedText).toBe(payload);
  });

  it("returns empty metadata for blank content", () => {
    const result = formatResultContent("   ");

    expect(result.isJson).toBe(false);
    expect(result.formattedText).toBe("");
  });
});

describe("shouldCollapseContent", () => {
  it("collapses when content exceeds default limits", () => {
    const longContent = Array.from(
      { length: 30 },
      (_, idx) => `line-${idx}`,
    ).join("\n");
    expect(shouldCollapseContent(longContent)).toBe(true);
  });

  it("honours custom collapse thresholds", () => {
    const content = "a".repeat(100);
    expect(shouldCollapseContent(content, { maxCharacters: 50 })).toBe(true);
    expect(shouldCollapseContent(content, { maxCharacters: 120 })).toBe(false);
  });
});

describe("createContentPreview", () => {
  it("returns full text when under limit", () => {
    const preview = createContentPreview("short text", 20);
    expect(preview.preview).toBe("short text");
    expect(preview.isTruncated).toBe(false);
  });

  it("truncates long content with ellipsis", () => {
    const preview = createContentPreview("a".repeat(100), 10);
    expect(preview.isTruncated).toBe(true);
    expect(preview.preview.endsWith("…")).toBe(true);
    expect(preview.preview.length).toBeLessThanOrEqual(11);
  });
});

describe("getStatusColor", () => {
  it("maps statuses to semantic colors", () => {
    expect(getStatusColor("success")).toBe("green");
    expect(getStatusColor("error")).toBe("red");
    expect(getStatusColor("warning")).toBe("orange");
  });
});

describe("safeStringify", () => {
  it("returns original string values", () => {
    expect(safeStringify("plain")).toBe("plain");
  });

  it("stringifies objects with spacing", () => {
    const value = { foo: "bar" };
    expect(safeStringify(value, 2)).toBe('{\n  "foo": "bar"\n}');
  });

  it("falls back to String() when JSON.stringify throws", () => {
    const circular: any = {};
    circular.self = circular;

    expect(safeStringify(circular)).toBe("[object Object]");
  });
});
