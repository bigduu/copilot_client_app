export interface AgentSessionRestoreData {
  sessionId: string;
  projectId: string;
  projectPath: string;
  lastMessageCount?: number;
  timestamp: number;
}

const STORAGE_KEY_PREFIX = "bodhi_agent_session_";
const SESSION_INDEX_KEY = "bodhi_agent_session_index";

export class AgentSessionPersistenceService {
  static saveSession(
    sessionId: string,
    projectId: string,
    projectPath: string,
    messageCount?: number,
  ): void {
    try {
      const data: AgentSessionRestoreData = {
        sessionId,
        projectId,
        projectPath,
        lastMessageCount: messageCount,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        `${STORAGE_KEY_PREFIX}${sessionId}`,
        JSON.stringify(data),
      );
      const index = this.getSessionIndex();
      if (!index.includes(sessionId)) {
        index.push(sessionId);
        localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
      }
    } catch {
      return;
    }
  }

  static loadSession(sessionId: string): AgentSessionRestoreData | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${sessionId}`);
      if (!raw) return null;
      const data = JSON.parse(raw) as AgentSessionRestoreData;
      if (!data.sessionId || !data.projectId || !data.projectPath) return null;
      return data;
    } catch {
      return null;
    }
  }

  static removeSession(sessionId: string): void {
    try {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${sessionId}`);
      const index = this.getSessionIndex().filter((id) => id !== sessionId);
      localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(index));
    } catch {
      return;
    }
  }

  static getSessionIndex(): string[] {
    try {
      const raw = localStorage.getItem(SESSION_INDEX_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  static cleanupOldSessions(days = 30): void {
    try {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const index = this.getSessionIndex();
      const active: string[] = [];
      index.forEach((id) => {
        const data = this.loadSession(id);
        if (data && data.timestamp > cutoff) {
          active.push(id);
        } else {
          localStorage.removeItem(`${STORAGE_KEY_PREFIX}${id}`);
        }
      });
      localStorage.setItem(SESSION_INDEX_KEY, JSON.stringify(active));
    } catch {
      return;
    }
  }
}
