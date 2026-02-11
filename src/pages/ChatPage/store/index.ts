import { create } from "zustand";
import { devtools, subscribeWithSelector } from "zustand/middleware";
import { ChatSlice, createChatSlice } from "./slices/chatSessionSlice";
import { ModelSlice, createModelSlice } from "./slices/modelSlice";
import { PromptSlice, createPromptSlice } from "./slices/promptSlice";
import { FavoritesSlice, createFavoritesSlice } from "./slices/favoritesSlice";
import { SessionSlice, createSessionSlice } from "./slices/appSettingsSlice";
import { SkillSlice, createSkillSlice } from "./slices/skillSlice";
import { AgentClient } from "../services/AgentService";
import { serviceFactory } from "../../../services/common/ServiceFactory";
import { readStoredProxyAuth } from "../../../shared/utils/proxyAuth";
import type { ChatItem, Message } from "../types/chat";

const DEFAULT_PROXY_AUTH_MODE = "auto";
const REQUIRED_PROXY_AUTH_MODE = "required";
const STARTUP_FALLBACK_MODELS = ["gpt-5-mini", "gpt-5", "gemini-2.5-pro"];
const SELECTED_MODEL_LS_KEY = "bamboo_selected_model_id";
const AGENT_HEALTH_CHECK_INTERVAL_MS = 10000;

type AgentAvailabilitySlice = {
  agentAvailability: boolean | null;
  setAgentAvailability: (available: boolean | null) => void;
  checkAgentAvailability: () => Promise<boolean>;
  startAgentHealthCheck: () => void;
};

const agentClient = AgentClient.getInstance();
let agentHealthCheckTimer: ReturnType<typeof setInterval> | null = null;
let agentHealthCheckInFlight: Promise<boolean> | null = null;
const chatLookupCache = new WeakMap<ReadonlyArray<ChatItem>, Map<string, ChatItem>>();

export type AppState = ChatSlice &
  ModelSlice &
  PromptSlice &
  FavoritesSlice &
  SessionSlice &
  SkillSlice &
  AgentAvailabilitySlice;

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set, get, api) => ({
      ...createChatSlice(set, get, api),
      ...createModelSlice(set, get, api),
      ...createPromptSlice(set, get, api),
      ...createFavoritesSlice(set, get, api),
      ...createSessionSlice(set, get, api),
      ...createSkillSlice(set, get, api),
      agentAvailability: null,
      setAgentAvailability: (available) => {
        set({ agentAvailability: available });
      },
      checkAgentAvailability: async () => {
        if (agentHealthCheckInFlight) {
          return agentHealthCheckInFlight;
        }

        agentHealthCheckInFlight = (async () => {
          const available = await agentClient.healthCheck();

          if (get().agentAvailability !== available) {
            set({ agentAvailability: available });
          }

          return available;
        })();

        try {
          return await agentHealthCheckInFlight;
        } finally {
          agentHealthCheckInFlight = null;
        }
      },
      startAgentHealthCheck: () => {
        if (agentHealthCheckTimer) {
          return;
        }

        void get().checkAgentAvailability();

        agentHealthCheckTimer = setInterval(() => {
          void get().checkAgentAvailability();
        }, AGENT_HEALTH_CHECK_INTERVAL_MS);
      },
    })),
    { name: "AppStore" },
  ),
);

const getChatLookup = (chats: ReadonlyArray<ChatItem>): Map<string, ChatItem> => {
  const cached = chatLookupCache.get(chats);
  if (cached) {
    return cached;
  }

  const lookup = new Map(chats.map((chat) => [chat.id, chat]));
  chatLookupCache.set(chats, lookup);
  return lookup;
};

export const selectChatById =
  (chatId: string | null) =>
  (state: AppState): ChatItem | null => {
    if (!chatId) {
      return null;
    }

    return getChatLookup(state.chats).get(chatId) ?? null;
  };

export const selectCurrentChat = (state: AppState): ChatItem | null => {
  if (!state.currentChatId) {
    return null;
  }

  return getChatLookup(state.chats).get(state.currentChatId) ?? null;
};

export const selectCurrentMessages = (state: AppState): Message[] =>
  selectCurrentChat(state)?.messages ?? [];

const applyStoredProxyAuth = async (): Promise<boolean> => {
  const storedAuth = readStoredProxyAuth();
  if (!storedAuth) {
    return false;
  }

  try {
    await serviceFactory.setProxyAuth(storedAuth);
    return true;
  } catch (error) {
    console.error("Failed to apply stored proxy auth during startup:", error);
    return false;
  }
};

const bootstrapProxyAuthGate = async (): Promise<boolean> => {
  try {
    const config = await serviceFactory.getBambooConfig();
    const mode =
      typeof config?.proxy_auth_mode === "string"
        ? config.proxy_auth_mode
        : DEFAULT_PROXY_AUTH_MODE;

    if (mode !== REQUIRED_PROXY_AUTH_MODE) {
      await applyStoredProxyAuth();
      return false;
    }

    const hasAppliedStoredAuth = await applyStoredProxyAuth();
    if (hasAppliedStoredAuth) {
      return false;
    }

    const storedModel = localStorage.getItem(SELECTED_MODEL_LS_KEY);
    const selectedModel = storedModel || STARTUP_FALLBACK_MODELS[0];
    if (!storedModel) {
      localStorage.setItem(SELECTED_MODEL_LS_KEY, selectedModel);
    }

    useAppStore.setState((state) => ({
      ...state,
      models: STARTUP_FALLBACK_MODELS,
      selectedModel,
      modelsError:
        "Proxy auth mode is set to required. Please configure proxy username/password and apply it.",
      isLoadingModels: false,
    }));

    return true;
  } catch (error) {
    console.error("Failed to evaluate startup proxy auth mode:", error);
    return false;
  }
};

// Initialize the store
const initializeStore = async () => {
  if (import.meta.env.MODE !== "test") {
    useAppStore.getState().startAgentHealthCheck();
  }

  const shouldSkipModelBootstrap = await bootstrapProxyAuthGate();

  if (!shouldSkipModelBootstrap) {
    await useAppStore.getState().fetchModels();
  }

  await useAppStore.getState().loadChats();
  await useAppStore.getState().loadSystemPrompts();
  await useAppStore.getState().loadFavorites();
};

initializeStore();
