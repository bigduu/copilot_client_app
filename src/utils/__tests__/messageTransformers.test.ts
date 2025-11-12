import { describe, it, expect } from "vitest";
import {
  transformMessageDTOToMessage,
  normalizeDisplayPreference,
  stringifyResultValue,
} from "../messageTransformers";
import type { MessageDTO } from "../../services/BackendContextService";
import type {
  UserFileReferenceMessage,
  AssistantToolResultMessage,
  DisplayPreference,
} from "../../types/chat";

describe("messageTransformers - File Reference", () => {
  describe("transformMessageDTOToMessage - File Reference Messages", () => {
    it("should parse single file reference from JSON format", () => {
      const dto: MessageDTO = {
        id: "msg-1",
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: "file_reference",
              paths: ["Cargo.toml"],
              display_text: "@Cargo.toml what's the content?",
            }),
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual([
        "Cargo.toml",
      ]);
      expect((result as UserFileReferenceMessage).displayText).toBe(
        "@Cargo.toml what's the content?"
      );
    });

    it("should parse multiple file references from JSON format", () => {
      const dto: MessageDTO = {
        id: "msg-2",
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: "file_reference",
              paths: ["Cargo.toml", "README.md", "src/"],
              display_text: "@Cargo.toml @README.md @src/ compare these",
            }),
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual([
        "Cargo.toml",
        "README.md",
        "src/",
      ]);
      expect((result as UserFileReferenceMessage).displayText).toBe(
        "@Cargo.toml @README.md @src/ compare these"
      );
    });

    it("should handle backward compatibility with single path format", () => {
      const dto: MessageDTO = {
        id: "msg-3",
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: "file_reference",
              path: "Cargo.toml", // Old format: single path
              display_text: "@Cargo.toml what's the content?",
            }),
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual([
        "Cargo.toml",
      ]);
    });

    it("should parse file references from @ prefix in text", () => {
      const dto: MessageDTO = {
        id: "msg-4",
        role: "user",
        content: [
          {
            type: "text",
            text: "@Cargo.toml @README.md compare these files",
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual([
        "Cargo.toml",
        "README.md",
      ]);
      expect((result as UserFileReferenceMessage).displayText).toBe(
        "@Cargo.toml @README.md compare these files"
      );
    });

    it("should handle single @ reference in text", () => {
      const dto: MessageDTO = {
        id: "msg-5",
        role: "user",
        content: [
          {
            type: "text",
            text: "@src/ what files are here?",
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual(["src/"]);
      expect((result as UserFileReferenceMessage).displayText).toBe(
        "@src/ what files are here?"
      );
    });

    it("should treat regular user message without @ as normal text", () => {
      const dto: MessageDTO = {
        id: "msg-6",
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello, how are you?",
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as any).type).toBeUndefined();
      expect((result as any).content).toBe("Hello, how are you?");
    });

    it("should handle paths as string instead of array", () => {
      const dto: MessageDTO = {
        id: "msg-7",
        role: "user",
        content: [
          {
            type: "text",
            text: JSON.stringify({
              type: "file_reference",
              paths: "Cargo.toml", // String instead of array
              display_text: "@Cargo.toml what's the content?",
            }),
          },
        ],
        message_type: "text",
        tool_calls: null,
        tool_result: null,
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("user");
      expect((result as UserFileReferenceMessage).type).toBe("file_reference");
      expect((result as UserFileReferenceMessage).paths).toEqual([
        "Cargo.toml",
      ]);
    });
  });

  describe("transformMessageDTOToMessage - Tool Result Messages", () => {
    it("should parse tool result with Hidden display preference", () => {
      const dto: MessageDTO = {
        id: "msg-8",
        role: "tool",
        content: [
          {
            type: "text",
            text: '{"content": "File content here"}',
          },
        ],
        message_type: "tool_result",
        tool_calls: null,
        tool_result: {
          request_id: "read_file",
          display_preference: "Hidden", // ✅ At top level of tool_result
          result: {
            content: "File content here",
          },
        },
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("assistant");
      expect((result as AssistantToolResultMessage).type).toBe("tool_result");
      expect(
        (result as AssistantToolResultMessage).result.display_preference
      ).toBe("Hidden");
    });

    it("should parse tool result with Default display preference", () => {
      const dto: MessageDTO = {
        id: "msg-9",
        role: "tool",
        content: [
          {
            type: "text",
            text: '{"content": "File content here"}',
          },
        ],
        message_type: "tool_result",
        tool_calls: null,
        tool_result: {
          request_id: "read_file",
          display_preference: "Default", // ✅ At top level of tool_result
          result: {
            content: "File content here",
          },
        },
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("assistant");
      expect((result as AssistantToolResultMessage).type).toBe("tool_result");
      expect(
        (result as AssistantToolResultMessage).result.display_preference
      ).toBe("Default");
    });

    it("should parse tool result with Collapsible display preference", () => {
      const dto: MessageDTO = {
        id: "msg-10",
        role: "tool",
        content: [
          {
            type: "text",
            text: '{"content": "File content here"}',
          },
        ],
        message_type: "tool_result",
        tool_calls: null,
        tool_result: {
          request_id: "read_file",
          display_preference: "Collapsible", // ✅ At top level of tool_result
          result: {
            content: "File content here",
          },
        },
      };

      const result = transformMessageDTOToMessage(dto);

      expect(result.role).toBe("assistant");
      expect((result as AssistantToolResultMessage).type).toBe("tool_result");
      expect(
        (result as AssistantToolResultMessage).result.display_preference
      ).toBe("Collapsible");
    });
  });

  describe("normalizeDisplayPreference", () => {
    it("should normalize 'Hidden' to 'Hidden'", () => {
      expect(normalizeDisplayPreference("Hidden")).toBe("Hidden");
    });

    it("should normalize 'Collapsible' to 'Collapsible'", () => {
      expect(normalizeDisplayPreference("Collapsible")).toBe("Collapsible");
    });

    it("should normalize 'Default' to 'Default'", () => {
      expect(normalizeDisplayPreference("Default")).toBe("Default");
    });

    it("should normalize unknown values to 'Default'", () => {
      expect(normalizeDisplayPreference("Unknown")).toBe("Default");
      expect(normalizeDisplayPreference(null)).toBe("Default");
      expect(normalizeDisplayPreference(undefined)).toBe("Default");
      expect(normalizeDisplayPreference(123)).toBe("Default");
    });
  });

  describe("stringifyResultValue", () => {
    it("should return string as-is", () => {
      expect(stringifyResultValue("Hello")).toBe("Hello");
    });

    it("should return empty string for null", () => {
      expect(stringifyResultValue(null)).toBe("");
    });

    it("should return empty string for undefined", () => {
      expect(stringifyResultValue(undefined)).toBe("");
    });

    it("should stringify objects with indentation", () => {
      const obj = { name: "test", value: 123 };
      const result = stringifyResultValue(obj);
      expect(result).toContain('"name": "test"');
      expect(result).toContain('"value": 123');
    });

    it("should stringify arrays with indentation", () => {
      const arr = ["item1", "item2"];
      const result = stringifyResultValue(arr);
      expect(result).toContain('"item1"');
      expect(result).toContain('"item2"');
    });
  });
});
