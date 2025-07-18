/**
 * Strict Mode Category Configuration Manager
 * Core principle: Frontend cannot have any hardcoded definitions, must throw error if no configuration
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
 * Strict Mode Category Configuration Manager
 * All configurations must be obtained from backend, frontend contains no default values
 */
export class StrictCategoryConfigManager {
  private static instance: StrictCategoryConfigManager;
  
  // Configuration obtained from backend - no default values
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
   * Load configuration from backend
   * This is the only source of configuration
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
   * Check if configuration is loaded
   */
  private ensureConfigLoaded(): void {
    if (!this.isConfigLoaded) {
      throw new Error('Category configuration has not been loaded from backend. Frontend contains no default configuration, must first obtain configuration information from backend.');
    }
  }

  /**
   * Get category icon - strict mode, throw error if no configuration
   */
  getCategoryIcon(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const icon = this.configuredIcons[categoryType];
    if (!icon) {
      throw new Error(`Unconfigured category type icon: ${categoryType}. Please ensure backend has provided icon configuration for this category.`);
    }
    return icon;
  }

  /**
   * Get category color - strict mode, throw error if no configuration
   */
  getCategoryColor(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const color = this.configuredColors[categoryType];
    if (!color) {
      throw new Error(`Unconfigured category type color: ${categoryType}. Please ensure backend has provided color configuration for this category.`);
    }
    return color;
  }

  /**
   * Get category display name - strict mode, throw error if no configuration
   */
  getCategoryDisplayName(categoryType: string): string {
    this.ensureConfigLoaded();
    
    const displayName = this.configuredDisplayNames[categoryType];
    if (!displayName) {
      throw new Error(`Unconfigured category type display name: ${categoryType}. Please ensure backend has provided display name configuration for this category.`);
    }
    return displayName;
  }

  /**
   * Clear all configurations
   */
  clearConfig(): void {
    this.configuredIcons = {};
    this.configuredColors = {};
    this.configuredDisplayNames = {};
    this.isConfigLoaded = false;
  }

  /**
   * Get all configured category types
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
   * Check if category is fully configured
   */
  isCategoryFullyConfigured(categoryType: string): boolean {
    return this.isConfigLoaded &&
           this.configuredIcons.hasOwnProperty(categoryType) &&
           this.configuredColors.hasOwnProperty(categoryType) &&
           this.configuredDisplayNames.hasOwnProperty(categoryType);
  }

  /**
   * Validate category configuration completeness
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
        error: 'Configuration has not been loaded from backend'
      };
    }

    const missingConfigs: string[] = [];
    
    if (!this.configuredIcons.hasOwnProperty(categoryType)) {
      missingConfigs.push('icon');
    }
    if (!this.configuredColors.hasOwnProperty(categoryType)) {
      missingConfigs.push('color');
    }
    if (!this.configuredDisplayNames.hasOwnProperty(categoryType)) {
      missingConfigs.push('display name');
    }

    return {
      isValid: missingConfigs.length === 0,
      missingConfigs,
      error: missingConfigs.length > 0 ? 
        `Category ${categoryType} missing configuration: ${missingConfigs.join(', ')}` :
        undefined
    };
  }
}

/**
 * Create strict mode tool category information
 * All information must be obtained from backend configuration
 */
export const createStrictCategoryInfo = (categoryType: string): ToolCategoryInfo => {
  const manager = StrictCategoryConfigManager.getInstance();
  
  // Validate configuration completeness
  const validation = manager.validateCategoryConfig(categoryType);
  if (!validation.isValid) {
    throw new Error(`Unable to create category information: ${validation.error}`);
  }
  
  return {
    id: categoryType,
    name: manager.getCategoryDisplayName(categoryType),
    description: `${manager.getCategoryDisplayName(categoryType)} related functionality`,
    system_prompt: `You are a professional ${manager.getCategoryDisplayName(categoryType)} assistant`,
    tools: [], // Tool list should be obtained from backend
    restrict_conversation: false,
    enabled: true,
    icon: manager.getCategoryIcon(categoryType),
    color: manager.getCategoryColor(categoryType),
    strict_tools_mode: false,
    category_type: categoryType
  };
};

/**
 * Test strict mode configuration
 */
export const testStrictModeConfig = () => {
  const manager = StrictCategoryConfigManager.getInstance();
  
  console.log('=== Strict Mode Category Configuration Test ===');
  
  try {
    // Try to get behavior when configuration is not loaded
    console.log('Testing behavior when configuration is not loaded:');
    manager.getCategoryIcon('file_operations');
  } catch (error) {
    console.log('✅ Correctly threw error:', (error as Error).message);
  }
  
  // Simulate loading configuration from backend
  console.log('\nSimulating loading configuration from backend...');
  manager.loadConfigFromBackend(
    { 'file_operations': '📁', 'command_execution': '⚡' },
    { 'file_operations': 'green', 'command_execution': 'magenta' },
    { 'file_operations': 'File Operations', 'command_execution': 'Command Execution' }
  );
  
  // Test configured categories
  console.log('\nTesting configured categories:');
  try {
    const icon = manager.getCategoryIcon('file_operations');
    const color = manager.getCategoryColor('file_operations');
    const name = manager.getCategoryDisplayName('file_operations');
    console.log('✅ file_operations configuration normal:', { icon, color, name });
  } catch (error) {
    console.log('❌ Configuration error:', (error as Error).message);
  }
  
  // Test unconfigured categories
  console.log('\nTesting unconfigured categories:');
  try {
    manager.getCategoryIcon('unknown_category');
  } catch (error) {
    console.log('✅ Correctly rejected unconfigured category:', (error as Error).message);
  }
};

// Export strict mode manager instance
export const strictCategoryManager = StrictCategoryConfigManager.getInstance();

// Backward compatible exports (but will throw error when used)
export const dynamicCategoryManager = strictCategoryManager;
export const DynamicCategoryConfigManager = StrictCategoryConfigManager;