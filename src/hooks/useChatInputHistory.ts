import { useCallback, useEffect, useRef, useState } from "react";

export type HistoryDirection = "previous" | "next";

interface NavigateResult {
  value: string | null;
  applied: boolean;
}

export const useChatInputHistory = (chatId: string | null) => {
  const historyMapRef = useRef<Map<string, string[]>>(new Map());
  const navigationAppliedRef = useRef(false);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  useEffect(() => {
    setHistoryIndex(null);
    navigationAppliedRef.current = false;
  }, [chatId]);

  const recordEntry = useCallback(
    (entry: string) => {
      if (!chatId) {
        return;
      }
      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }

      const history = historyMapRef.current.get(chatId) ?? [];
      if (history[history.length - 1] === trimmed) {
        return;
      }

      const updatedHistory = [...history, trimmed].slice(-50);
      historyMapRef.current.set(chatId, updatedHistory);
      setHistoryIndex(null);
      navigationAppliedRef.current = false;
    },
    [chatId],
  );

  const navigate = useCallback(
    (direction: HistoryDirection, currentValue: string): NavigateResult => {
      if (!chatId) {
        return { value: null, applied: false };
      }

      const history = historyMapRef.current.get(chatId) ?? [];
      if (history.length === 0) {
        return { value: null, applied: false };
      }

      const trimmedCurrent = currentValue.trim();

      if (direction === "previous") {
        if (trimmedCurrent.length > 0 && historyIndex === null) {
          return { value: null, applied: false };
        }

        const currentPosition = historyIndex ?? history.length;
        const nextIndex = Math.max(0, currentPosition - 1);
        if (nextIndex === historyIndex) {
          return { value: null, applied: false };
        }

        setHistoryIndex(nextIndex);
        navigationAppliedRef.current = true;
        return { value: history[nextIndex] ?? null, applied: true };
      }

      // direction === "next"
      if (historyIndex === null) {
        return { value: null, applied: false };
      }

      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        navigationAppliedRef.current = true;
        return { value: "", applied: true };
      }

      setHistoryIndex(nextIndex);
      navigationAppliedRef.current = true;
      return { value: history[nextIndex] ?? null, applied: true };
    },
    [chatId, historyIndex],
  );

  const acknowledgeManualInput = useCallback(() => {
    if (navigationAppliedRef.current) {
      navigationAppliedRef.current = false;
      return;
    }

    if (historyIndex !== null) {
      setHistoryIndex(null);
    }
  }, [historyIndex]);

  const clearHistory = useCallback(() => {
    if (!chatId) {
      return;
    }
    historyMapRef.current.delete(chatId);
    setHistoryIndex(null);
    navigationAppliedRef.current = false;
  }, [chatId]);

  return {
    recordEntry,
    navigate,
    acknowledgeManualInput,
    clearHistory,
  };
};
