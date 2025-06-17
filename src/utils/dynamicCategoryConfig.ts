/**
 * 严格模式类别配置管理器
 * 核心原则：前端不能有任何hardcode定义，没有配置就必须报错
 */

import { ToolCategoryInfo } from '../types/toolCategory';

// 接口定义保持不变
export interface IconMapping {
  [categoryType: string]: string;
}

export interface ColorMapping {
  [categoryType: string]: string;
}

export interface DisplayNameMapping {
  [categoryType: string]: string;
}

/**
 * 严格模式类别配置管理器
 * 所有配置必须从后端获取，前端不包含任何默认值
 */
export class StrictCategoryConfigManager {
  private static instance: StrictCategoryConfigManager;
  
  // 从后端获取的配置 - 没有默认值
  private configuredIcons: IconMapping = {};
  private configuredColors: ColorMapping = {};
  private configuredDisplayNames: DisplayNameMapping = {};
  private isConfigLoaded = false;

  static getInstance(): StrictCategoryConfigManager {
    if (!StrictCategoryConfigManager.instance) {
      StrictCategoryConfigManager.instance = new StrictCategoryConfigManager();
    }
    return StrictCategoryConfigManager.instance;
  }

  /**
   * 从后端加载配置
   * 这是唯一的配置来源
   */
  loadConfigFromBackend(
    icons: IconMapping,
    colors: ColorMapping,
    displayNames: DisplayNameMapping
  ): void {
    this.configuredIcons = { ...icons };
    this.configuredColors = { ...colors };
    this.configuredDisplayNames = { ...displayNames };
    this.isConfigLoaded = true;
  }

  /**
   * 检查配置是否已加载
   */
  private ensureConfigLoaded(): void {
    if (!this.isConfigLoaded) {
      throw new Error('类别配置尚未从后端加载。前端不包含任何默认配置，必须先从后端获取配置信息。');
    }
  }

  /**
   * 获取类别图标 - 严格模式，没有配置就报错
   */
  getCategoryIcon(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const icon = this.configuredIcons[categoryType];
    if (!icon) {
      throw new Error(`未配置的类别类型图标: ${categoryType}。请确保后端已提供该类别的图标配置。`);
    }
    return icon;
  }

  /**
   * 获取类别颜色 - 严格模式，没有配置就报错
   */
  getCategoryColor(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const color = this.configuredColors[categoryType];
    if (!color) {
      throw new Error(`未配置的类别类型颜色: ${categoryType}。请确保后端已提供该类别的颜色配置。`);
    }
    return color;
  }

  /**
   * 获取类别显示名称 - 严格模式，没有配置就报错
   */
  getCategoryDisplayName(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const displayName = this.configuredDisplayNames[categoryType];
    if (!displayName) {
      throw new Error(`未配置的类别类型显示名称: ${categoryType}。请确保后端已提供该类别的显示名称配置。`);
    }
    return displayName;
  }

  /**
   * 清空所有配置
   */
  clearConfig(): void {
    this.configuredIcons = {};
    this.configuredColors = {};
    this.configuredDisplayNames = {};
    this.isConfigLoaded = false;
  }

  /**
   * 获取所有已配置的类别类型
   */
  getAllConfiguredCategories(): string[] {
    this.ensureConfigLoaded();
    
    const allCategories = new Set([
      ...Object.keys(this.configuredIcons),
      ...Object.keys(this.configuredColors),
      ...Object.keys(this.configuredDisplayNames)
    ]);
    return Array.from(allCategories);
  }

  /**
   * 检查类别是否完全配置
   */
  isCategoryFullyConfigured(categoryType: string): boolean {
    return this.isConfigLoaded &&
           this.configuredIcons.hasOwnProperty(categoryType) &&
           this.configuredColors.hasOwnProperty(categoryType) &&
           this.configuredDisplayNames.hasOwnProperty(categoryType);
  }

  /**
   * 验证类别配置完整性
   */
  validateCategoryConfig(categoryType: string): {
    isValid: boolean;
    missingConfigs: string[];
    error?: string;
  } {
    if (!this.isConfigLoaded) {
      return {
        isValid: false,
        missingConfigs: [],
        error: '配置尚未从后端加载'
      };
    }

    const missingConfigs: string[] = [];
    
    if (!this.configuredIcons.hasOwnProperty(categoryType)) {
      missingConfigs.push('图标');
    }
    if (!this.configuredColors.hasOwnProperty(categoryType)) {
      missingConfigs.push('颜色');
    }
    if (!this.configuredDisplayNames.hasOwnProperty(categoryType)) {
      missingConfigs.push('显示名称');
    }

    return {
      isValid: missingConfigs.length === 0,
      missingConfigs,
      error: missingConfigs.length > 0 ? 
        `类别 ${categoryType} 缺少配置: ${missingConfigs.join(', ')}` : 
        undefined
    };
  }
}

/**
 * 创建严格模式的工具类别信息
 * 所有信息必须从后端配置获取
 */
export const createStrictCategoryInfo = (categoryType: string): ToolCategoryInfo => {
  const manager = StrictCategoryConfigManager.getInstance();
  
  // 验证配置完整性
  const validation = manager.validateCategoryConfig(categoryType);
  if (!validation.isValid) {
    throw new Error(`无法创建类别信息: ${validation.error}`);
  }
  
  return {
    id: categoryType,
    name: manager.getCategoryDisplayName(categoryType),
    description: `${manager.getCategoryDisplayName(categoryType)}相关功能`,
    system_prompt: `你是一个专业的${manager.getCategoryDisplayName(categoryType)}助手`,
    tools: [], // 工具列表应该从后端获取
    restrict_conversation: false,
    enabled: true,
    icon: manager.getCategoryIcon(categoryType),
    color: manager.getCategoryColor(categoryType),
    strict_tools_mode: false,
    category_type: categoryType
  };
};

/**
 * 测试严格模式配置
 */
export const testStrictModeConfig = () => {
  const manager = StrictCategoryConfigManager.getInstance();
  
  console.log('=== 严格模式类别配置测试 ===');
  
  try {
    // 尝试获取未加载配置时的行为
    console.log('测试未加载配置时的行为:');
    manager.getCategoryIcon('file_operations');
  } catch (error) {
    console.log('✅ 正确抛出错误:', (error as Error).message);
  }
  
  // 模拟从后端加载配置
  console.log('\n模拟从后端加载配置...');
  manager.loadConfigFromBackend(
    { 'file_operations': '📁', 'command_execution': '⚡' },
    { 'file_operations': 'green', 'command_execution': 'magenta' },
    { 'file_operations': '文件操作', 'command_execution': '命令执行' }
  );
  
  // 测试已配置的类别
  console.log('\n测试已配置的类别:');
  try {
    const icon = manager.getCategoryIcon('file_operations');
    const color = manager.getCategoryColor('file_operations');
    const name = manager.getCategoryDisplayName('file_operations');
    console.log('✅ file_operations 配置正常:', { icon, color, name });
  } catch (error) {
    console.log('❌ 配置错误:', (error as Error).message);
  }
  
  // 测试未配置的类别
  console.log('\n测试未配置的类别:');
  try {
    manager.getCategoryIcon('unknown_category');
  } catch (error) {
    console.log('✅ 正确拒绝未配置类别:', (error as Error).message);
  }
};

// 导出严格模式管理器实例
export const strictCategoryManager = StrictCategoryConfigManager.getInstance();

// 向后兼容的导出（但会在使用时报错）
export const dynamicCategoryManager = strictCategoryManager;
export const DynamicCategoryConfigManager = StrictCategoryConfigManager;