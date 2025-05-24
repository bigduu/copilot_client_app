import { SystemPromptPreset, SystemPromptPresetList } from "../types/chat";
import { DEFAULT_MESSAGE } from "../constants";

const SYSTEM_PROMPT_KEY = "system_prompt";
const SYSTEM_PROMPT_PRESETS_KEY = "system_prompt_presets";
const SYSTEM_PROMPT_SELECTED_ID_KEY = "system_prompt_selected_id";

/**
 * SystemPromptService 处理系统提示相关的核心业务逻辑
 * 包括系统提示预设的增删改查、持久化等
 */
export class SystemPromptService {
  private static instance: SystemPromptService;

  static getInstance(): SystemPromptService {
    if (!SystemPromptService.instance) {
      SystemPromptService.instance = new SystemPromptService();
    }
    return SystemPromptService.instance;
  }

  /**
   * 获取全局系统提示
   */
  getGlobalSystemPrompt(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_KEY) || DEFAULT_MESSAGE;
    } catch (error) {
      console.error("Error loading global system prompt:", error);
      return DEFAULT_MESSAGE;
    }
  }

  /**
   * 更新全局系统提示
   */
  updateGlobalSystemPrompt(prompt: string): void {
    try {
      const promptToSave = prompt && prompt.trim() ? prompt : DEFAULT_MESSAGE;
      localStorage.setItem(SYSTEM_PROMPT_KEY, promptToSave);
      console.log("Global system prompt updated successfully");
    } catch (error) {
      console.error("Error saving system prompt:", error);
    }
  }

  /**
   * 加载系统提示预设列表
   */
  loadSystemPromptPresets(): SystemPromptPresetList {
    try {
      const raw = localStorage.getItem(SYSTEM_PROMPT_PRESETS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (error) {
      console.error("Error loading system prompt presets:", error);
    }
    
    // 如果没有，初始化一个默认
    return [
      {
        id: "default",
        name: "默认助手",
        content: DEFAULT_MESSAGE,
      },
    ];
  }

  /**
   * 保存系统提示预设列表
   */
  saveSystemPromptPresets(presets: SystemPromptPresetList): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_PRESETS_KEY, JSON.stringify(presets));
    } catch (error) {
      console.error("Error saving system prompt presets:", error);
    }
  }

  /**
   * 获取当前选中的预设ID
   */
  getSelectedSystemPromptPresetId(): string {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_SELECTED_ID_KEY) || "default";
    } catch (error) {
      console.error("Error loading selected system prompt preset ID:", error);
      return "default";
    }
  }

  /**
   * 设置当前选中的预设ID
   */
  setSelectedSystemPromptPresetId(id: string): void {
    try {
      localStorage.setItem(SYSTEM_PROMPT_SELECTED_ID_KEY, id);
    } catch (error) {
      console.error("Error saving selected system prompt preset ID:", error);
    }
  }

  /**
   * 添加系统提示预设
   */
  addSystemPromptPreset(
    preset: Omit<SystemPromptPreset, "id">,
    currentPresets: SystemPromptPresetList
  ): SystemPromptPresetList {
    const id = crypto.randomUUID();
    const newPreset = { ...preset, id };
    return [...currentPresets, newPreset];
  }

  /**
   * 更新系统提示预设
   */
  updateSystemPromptPreset(
    id: string,
    preset: Omit<SystemPromptPreset, "id">,
    currentPresets: SystemPromptPresetList
  ): SystemPromptPresetList {
    return currentPresets.map((p) =>
      p.id === id ? { ...preset, id } : p
    );
  }

  /**
   * 删除系统提示预设
   */
  deleteSystemPromptPreset(
    id: string,
    currentPresets: SystemPromptPresetList,
    selectedPresetId: string
  ): {
    newPresets: SystemPromptPresetList;
    newSelectedId: string;
  } {
    const newPresets = currentPresets.filter((p) => p.id !== id);
    let newSelectedId = selectedPresetId;
    
    // 如果删除的是当前选中的预设，重置为default
    if (selectedPresetId === id) {
      newSelectedId = "default";
    }
    
    return { newPresets, newSelectedId };
  }

  /**
   * 根据选中的预设ID获取当前系统提示内容
   */
  getCurrentSystemPromptContent(
    presets: SystemPromptPresetList,
    selectedPresetId: string
  ): string {
    const selectedPreset = presets.find((p) => p.id === selectedPresetId);
    if (selectedPreset) return selectedPreset.content;

    // Fallback to global or default if selected preset not found or content is empty
    return this.getGlobalSystemPrompt();
  }

  /**
   * 根据ID查找预设
   */
  findPresetById(
    id: string,
    presets: SystemPromptPresetList
  ): SystemPromptPreset | undefined {
    return presets.find((preset) => preset.id === id);
  }

  /**
   * 检查预设名称是否已存在
   */
  presetNameExists(
    name: string,
    presets: SystemPromptPresetList,
    excludeId?: string
  ): boolean {
    return presets.some(
      (preset) => preset.name === name && preset.id !== excludeId
    );
  }

  /**
   * 验证预设数据
   */
  validatePreset(preset: Omit<SystemPromptPreset, "id">): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];
    
    if (!preset.name || preset.name.trim().length === 0) {
      errors.push("预设名称不能为空");
    }
    
    if (!preset.content || preset.content.trim().length === 0) {
      errors.push("预设内容不能为空");
    }
    
    if (preset.name && preset.name.length > 50) {
      errors.push("预设名称不能超过50个字符");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 导出预设到JSON格式
   */
  exportPresetsToJson(presets: SystemPromptPresetList): string {
    try {
      return JSON.stringify(presets, null, 2);
    } catch (error) {
      console.error("Error exporting presets to JSON:", error);
      throw new Error("导出预设失败");
    }
  }

  /**
   * 从JSON格式导入预设
   */
  importPresetsFromJson(
    jsonString: string,
    currentPresets: SystemPromptPresetList
  ): {
    success: boolean;
    newPresets?: SystemPromptPresetList;
    error?: string;
  } {
    try {
      const importedPresets = JSON.parse(jsonString) as SystemPromptPresetList;
      
      // 验证导入的数据格式
      if (!Array.isArray(importedPresets)) {
        return { success: false, error: "导入的数据格式不正确" };
      }
      
      // 验证每个预设的格式
      for (const preset of importedPresets) {
        if (!preset.id || !preset.name || !preset.content) {
          return { success: false, error: "导入的预设数据格式不完整" };
        }
      }
      
      // 合并预设，避免ID冲突
      const mergedPresets = [...currentPresets];
      const existingIds = new Set(currentPresets.map(p => p.id));
      
      importedPresets.forEach(preset => {
        if (!existingIds.has(preset.id)) {
          mergedPresets.push(preset);
        } else {
          // 如果ID冲突，生成新ID
          mergedPresets.push({
            ...preset,
            id: crypto.randomUUID(),
            name: `${preset.name} (导入)`,
          });
        }
      });
      
      return { success: true, newPresets: mergedPresets };
    } catch (error) {
      console.error("Error importing presets from JSON:", error);
      return { success: false, error: "JSON格式不正确" };
    }
  }
}
