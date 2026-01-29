import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { agentHttpService } from "../AgentHttpService";
import { ClaudeProject, ClaudeSession, ClaudeSettings } from "../agentHttpTypes";

describe("AgentHttpService", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => "http://localhost:8080/v1"),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getProjects", () => {
    it("should fetch and return projects", async () => {
      const mockProjects: ClaudeProject[] = [
        { id: "proj1", path: "/path/to/proj1", sessions: [], created_at: 1234567890, most_recent_session: null },
      ];
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProjects),
        } as Response)
      );

      const result = await agentHttpService.getProjects();
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/projects");
      expect(result).toEqual(mockProjects);
    });

    it("should throw error when fetch fails", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
        } as Response)
      );

      await expect(agentHttpService.getProjects()).rejects.toThrow("HTTP error! status: 500");
    });
  });

  describe("createProject", () => {
    it("should create a new project", async () => {
      const mockProject: ClaudeProject = {
        id: "new-proj",
        path: "/path/to/new",
        sessions: [],
        created_at: 1234567890,
        most_recent_session: null,
      };
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockProject),
        } as Response)
      );

      const result = await agentHttpService.createProject("/path/to/new");
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: "/path/to/new" }),
      });
      expect(result).toEqual(mockProject);
    });
  });

  describe("getProjectSessions", () => {
    it("should fetch sessions for a project", async () => {
      const mockSessions: ClaudeSession[] = [
        { id: "session1", project_id: "proj1", project_path: "/path", todo_data: null, created_at: 1234567890, first_message: null, message_timestamp: null },
      ];
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSessions),
        } as Response)
      );

      const result = await agentHttpService.getProjectSessions("proj1");
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/projects/proj1/sessions");
      expect(result).toEqual(mockSessions);
    });
  });

  describe("getClaudeSettings", () => {
    it("should fetch Claude settings", async () => {
      const mockSettings: ClaudeSettings = { data: { theme: "dark" } };
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockSettings),
        } as Response)
      );

      const result = await agentHttpService.getClaudeSettings();
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/settings");
      expect(result).toEqual(mockSettings);
    });
  });

  describe("saveClaudeSettings", () => {
    it("should save Claude settings", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response)
      );

      await agentHttpService.saveClaudeSettings({ theme: "light" });
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { theme: "light" } }),
      });
    });
  });

  describe("getSystemPrompt", () => {
    it("should fetch system prompt", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ content: "System prompt content", path: "/path" }),
        } as Response)
      );

      const result = await agentHttpService.getSystemPrompt();
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/system-prompt");
      expect(result).toBe("System prompt content");
    });
  });

  describe("saveSystemPrompt", () => {
    it("should save system prompt", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        } as Response)
      );

      await agentHttpService.saveSystemPrompt("New prompt");
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/system-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "New prompt" }),
      });
    });
  });

  describe("listRunningSessions", () => {
    it("should fetch running sessions", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        } as Response)
      );

      const result = await agentHttpService.listRunningSessions();
      
      expect(fetch).toHaveBeenCalledWith("http://localhost:8080/v1/agent/sessions/running");
      expect(result).toEqual([]);
    });
  });

  describe("getSessionJsonl", () => {
    it("should fetch session JSONL", async () => {
      const mockData = [{ message: "test" }];
      
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockData),
        } as Response)
      );

      const result = await agentHttpService.getSessionJsonl("proj1", "session1");
      
      expect(fetch).toHaveBeenCalledWith(
        "http://localhost:8080/v1/agent/sessions/session1/jsonl?project_id=proj1"
      );
      expect(result).toEqual(mockData);
    });
  });
});
