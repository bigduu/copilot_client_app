import { StateCreator } from "zustand";
import { skillService } from "../../services/SkillService";
import type {
  SkillDefinition,
  SkillFilter,
} from "../../types/skill";
import type { AppState } from "../";

export interface SkillSlice {
  // State
  skills: SkillDefinition[];
  isLoadingSkills: boolean;
  skillsError: string | null;

  // Actions
  loadSkills: (filter?: SkillFilter) => Promise<void>;
  getSkill: (id: string) => Promise<void>;
  clearSkillsError: () => void;
}

export const createSkillSlice: StateCreator<AppState, [], [], SkillSlice> = (
  set,
  get
) => ({
  // Initial state
  skills: [],
  isLoadingSkills: false,
  skillsError: null,

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
      const skills = get().skills;
      const existingIndex = skills.findIndex((item) => item.id === skill.id);
      const nextSkills =
        existingIndex >= 0
          ? skills.map((item) => (item.id === skill.id ? skill : item))
          : [...skills, skill];
      set({
        skills: nextSkills,
        isLoadingSkills: false,
      });
    } catch (error) {
      set({
        skillsError: error instanceof Error ? error.message : "Failed to get skill",
        isLoadingSkills: false,
      });
    }
  },

  clearSkillsError: () => {
    set({ skillsError: null });
  },
});
