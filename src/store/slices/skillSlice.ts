import { StateCreator } from "zustand";
import { skillService } from "../../services/SkillService";
import type {
  SkillDefinition,
  SkillFilter,
  CreateSkillRequest,
  UpdateSkillRequest,
} from "../../types/skill";
import type { AppState } from "../";

export interface SkillSlice {
  // State
  skills: SkillDefinition[];
  enabledSkillIds: string[];
  isLoadingSkills: boolean;
  skillsError: string | null;
  selectedSkill: SkillDefinition | null;
  availableTools: string[];
  availableWorkflows: string[];

  // Actions
  loadSkills: (filter?: SkillFilter) => Promise<void>;
  getSkill: (id: string) => Promise<void>;
  createSkill: (request: CreateSkillRequest) => Promise<void>;
  updateSkill: (id: string, request: UpdateSkillRequest) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
  enableSkill: (id: string, chatId?: string) => Promise<void>;
  disableSkill: (id: string, chatId?: string) => Promise<void>;
  loadAvailableTools: () => Promise<void>;
  loadAvailableWorkflows: () => Promise<void>;
  setSelectedSkill: (skill: SkillDefinition | null) => void;
  clearSkillsError: () => void;
}

export const createSkillSlice: StateCreator<AppState, [], [], SkillSlice> = (
  set,
  get
) => ({
  // Initial state
  skills: [],
  enabledSkillIds: [],
  isLoadingSkills: false,
  skillsError: null,
  selectedSkill: null,
  availableTools: [],
  availableWorkflows: [],

  // Actions
  loadSkills: async (filter?: SkillFilter) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      const response = await skillService.listSkills(filter);
      set({
        skills: response.skills,
        isLoadingSkills: false,
      });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to load skills",
        isLoadingSkills: false,
      });
    }
  },

  getSkill: async (id: string) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      const skill = await skillService.getSkill(id);
      set({
        selectedSkill: skill,
        isLoadingSkills: false,
      });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to get skill",
        isLoadingSkills: false,
      });
    }
  },

  createSkill: async (request: CreateSkillRequest) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      await skillService.createSkill(request);
      // Reload skills list
      await get().loadSkills();
      set({ isLoadingSkills: false });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to create skill",
        isLoadingSkills: false,
      });
    }
  },

  updateSkill: async (id: string, request: UpdateSkillRequest) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      await skillService.updateSkill(id, request);
      // Reload skills list and selected skill
      await get().loadSkills();
      if (get().selectedSkill?.id === id) {
        await get().getSkill(id);
      }
      set({ isLoadingSkills: false });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to update skill",
        isLoadingSkills: false,
      });
    }
  },

  deleteSkill: async (id: string) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      await skillService.deleteSkill(id);
      // Reload skills list
      await get().loadSkills();
      // Clear selected skill if it was deleted
      if (get().selectedSkill?.id === id) {
        set({ selectedSkill: null });
      }
      set({ isLoadingSkills: false });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to delete skill",
        isLoadingSkills: false,
      });
    }
  },

  enableSkill: async (id: string, chatId?: string) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      const response = await skillService.enableSkill(id, chatId);
      set({
        enabledSkillIds: response.enabled_skill_ids,
        isLoadingSkills: false,
      });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to enable skill",
        isLoadingSkills: false,
      });
    }
  },

  disableSkill: async (id: string, chatId?: string) => {
    set({ isLoadingSkills: true, skillsError: null });
    try {
      const response = await skillService.disableSkill(id, chatId);
      set({
        enabledSkillIds: response.enabled_skill_ids,
        isLoadingSkills: false,
      });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to disable skill",
        isLoadingSkills: false,
      });
    }
  },

  loadAvailableTools: async () => {
    try {
      const tools = await skillService.getAvailableTools();
      set({ availableTools: tools });
    } catch (error) {
      console.error("Failed to load available tools:", error);
    }
  },

  loadAvailableWorkflows: async () => {
    try {
      const workflows = await skillService.getAvailableWorkflows();
      set({ availableWorkflows: workflows });
    } catch (error) {
      console.error("Failed to load available workflows:", error);
    }
  },

  setSelectedSkill: (skill: SkillDefinition | null) => {
    set({ selectedSkill: skill });
  },

  clearSkillsError: () => {
    set({ skillsError: null });
  },
});
