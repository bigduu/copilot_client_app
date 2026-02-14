import { StateCreator } from 'zustand';
import { TokenUsage } from '../../types/tokenBudget';

export interface TokenBudgetState {
  // Map of chat ID to token usage
  tokenUsages: Record<string, TokenUsage>;
  // Map of chat ID to truncation flag
  truncationOccurred: Record<string, boolean>;
  // Map of chat ID to segments removed count
  segmentsRemoved: Record<string, number>;
}

export interface TokenBudgetActions {
  updateTokenUsage: (chatId: string, usage: TokenUsage) => void;
  setTruncationInfo: (
    chatId: string,
    truncationOccurred: boolean,
    segmentsRemoved: number
  ) => void;
  clearTokenUsage: (chatId: string) => void;
}

export type TokenBudgetSlice = TokenBudgetState & TokenBudgetActions;

export const createTokenBudgetSlice: StateCreator<
  TokenBudgetSlice,
  [],
  [],
  TokenBudgetSlice
> = (set) => ({
  tokenUsages: {},
  truncationOccurred: {},
  segmentsRemoved: {},

  updateTokenUsage: (chatId, usage) =>
    set((state) => ({
      tokenUsages: {
        ...state.tokenUsages,
        [chatId]: usage,
      },
    })),

  setTruncationInfo: (chatId, truncationOccurred, segmentsRemoved) =>
    set((state) => ({
      truncationOccurred: {
        ...state.truncationOccurred,
        [chatId]: truncationOccurred,
      },
      segmentsRemoved: {
        ...state.segmentsRemoved,
        [chatId]: segmentsRemoved,
      },
    })),

  clearTokenUsage: (chatId) =>
    set((state) => {
      const { [chatId]: _, ...remainingUsages } = state.tokenUsages;
      const { [chatId]: __, ...remainingTruncation } = state.truncationOccurred;
      const { [chatId]: ___, ...remainingSegments } = state.segmentsRemoved;
      return {
        tokenUsages: remainingUsages,
        truncationOccurred: remainingTruncation,
        segmentsRemoved: remainingSegments,
      };
    }),
});
