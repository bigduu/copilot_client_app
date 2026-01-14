import { describe, it, expect } from "vitest";
import {
  getDateGroupKeyForChat,
  groupChatsByDate,
  isToday,
  isYesterday,
  isThisWeek,
  isThisMonth,
} from "../chatUtils";
import { ChatItem } from "../../types/chat";

describe("chatUtils", () => {
  describe("getDateGroupKeyForChat", () => {
    it("should return 'Pinned' for pinned chats", () => {
      const chat: ChatItem = {
        id: "1",
        title: "Test Chat",
        createdAt: Date.now(),
        pinned: true,
        messages: [],
        currentInteraction: null,
        config: {
          systemPromptId: "default",
          baseSystemPrompt: "",
          lastUsedEnhancedPrompt: null,
        },
      };

      expect(getDateGroupKeyForChat(chat)).toBe("Pinned");
    });

    it("should return localized date string for non-pinned chats", () => {
      const now = new Date();
      const chat: ChatItem = {
        id: "1",
        title: "Test Chat",
        createdAt: now.getTime(),
        pinned: false,
        messages: [],
        currentInteraction: null,
        config: {
          systemPromptId: "default",
          baseSystemPrompt: "",
          lastUsedEnhancedPrompt: null,
        },
      };

      const expectedDateKey = now.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      expect(getDateGroupKeyForChat(chat)).toBe(expectedDateKey);
    });

    it("should return consistent date keys for chats on the same day", () => {
      const now = new Date();
      const chat1: ChatItem = {
        id: "1",
        title: "Test Chat 1",
        createdAt: now.getTime(),
        pinned: false,
        messages: [],
        currentInteraction: null,
        config: {
          systemPromptId: "default",
          baseSystemPrompt: "",
          lastUsedEnhancedPrompt: null,
        },
      };

      const chat2: ChatItem = {
        id: "2",
        title: "Test Chat 2",
        createdAt: now.getTime() + 1000, // 1 second later
        pinned: false,
        messages: [],
        currentInteraction: null,
        config: {
          systemPromptId: "default",
          baseSystemPrompt: "",
          lastUsedEnhancedPrompt: null,
        },
      };

      expect(getDateGroupKeyForChat(chat1)).toBe(getDateGroupKeyForChat(chat2));
    });
  });

  describe("groupChatsByDate", () => {
    it("should group pinned chats separately", () => {
      const chats: ChatItem[] = [
        {
          id: "1",
          title: "Pinned Chat",
          createdAt: Date.now(),
          pinned: true,
          messages: [],
          currentInteraction: null,
          config: {
            systemPromptId: "default",
            baseSystemPrompt: "",
            lastUsedEnhancedPrompt: null,
          },
        },
        {
          id: "2",
          title: "Regular Chat",
          createdAt: Date.now(),
          pinned: false,
          messages: [],
          currentInteraction: null,
          config: {
            systemPromptId: "default",
            baseSystemPrompt: "",
            lastUsedEnhancedPrompt: null,
          },
        },
      ];

      const grouped = groupChatsByDate(chats);
      expect(grouped["Pinned"]).toBeDefined();
      expect(grouped["Pinned"].length).toBe(1);
      expect(grouped["Pinned"][0].id).toBe("1");
    });

    it("should group chats by date", () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      const chats: ChatItem[] = [
        {
          id: "1",
          title: "Today's Chat",
          createdAt: now.getTime(),
          pinned: false,
          messages: [],
          currentInteraction: null,
          config: {
            systemPromptId: "default",
            baseSystemPrompt: "",
            lastUsedEnhancedPrompt: null,
          },
        },
        {
          id: "2",
          title: "Yesterday's Chat",
          createdAt: yesterday.getTime(),
          pinned: false,
          messages: [],
          currentInteraction: null,
          config: {
            systemPromptId: "default",
            baseSystemPrompt: "",
            lastUsedEnhancedPrompt: null,
          },
        },
      ];

      const grouped = groupChatsByDate(chats);
      const dateKeys = Object.keys(grouped);
      expect(dateKeys.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("date utility functions", () => {
    it("isToday should correctly identify today's date", () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    it("isYesterday should correctly identify yesterday's date", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isYesterday(yesterday)).toBe(true);

      const today = new Date();
      expect(isYesterday(today)).toBe(false);
    });

    it("isThisWeek should correctly identify dates in current week", () => {
      const today = new Date();
      expect(isThisWeek(today)).toBe(true);

      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 8);
      expect(isThisWeek(lastWeek)).toBe(false);
    });

    it("isThisMonth should correctly identify dates in current month", () => {
      const today = new Date();
      expect(isThisMonth(today)).toBe(true);

      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      expect(isThisMonth(lastMonth)).toBe(false);
    });
  });
});
