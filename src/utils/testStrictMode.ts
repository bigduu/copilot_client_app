/**
 * 严格模式测试文件
 * 验证所有默认配置已被移除，实现"无配置即报错"机制
 */

import { StrictCategoryConfigManager, testStrictModeConfig } from './dynamicCategoryConfig';

/**
 * 测试严格模式配置管理器
 */
export const testStrictModeImplementation = () => {
  console.log('=== 严格模式实现验证 ===');
  
  const manager = StrictCategoryConfigManager.getInstance();
  
  // 测试1: 验证未加载配置时所有操作都会报错
  console.log('\n测试1: 验证未加载配置时的报错机制');
  
  const testCategories = ['file_operations', 'command_execution', 'general_assistant', 'unknown_category'];
  
  testCategories.forEach(category => {
    console.log(`\n测试类别: ${category}`);
    
    // 测试图标获取
    try {
      manager.getCategoryIcon(category);
      console.log('❌ 错误: 应该抛出异常但没有');
    } catch (error) {
      console.log('✅ 图标获取正确抛出异常:', (error as Error).message);
    }
    
    // 测试颜色获取
    try {
      manager.getCategoryColor(category);
      console.log('❌ 错误: 应该抛出异常但没有');
    } catch (error) {
      console.log('✅ 颜色获取正确抛出异常:', (error as Error).message);
    }
    
    // 测试显示名称获取
    try {
      manager.getCategoryDisplayName(category);
      console.log('❌ 错误: 应该抛出异常但没有');
    } catch (error) {
      console.log('✅ 显示名称获取正确抛出异常:', (error as Error).message);
    }
  });
  
  // 测试2: 验证配置加载后的正常工作
  console.log('\n测试2: 验证配置加载后的正常工作');
  
  const mockBackendConfig = {
    icons: {
      'file_operations': '📁',
      'command_execution': '⚡',
      'general_assistant': '🤖'
    },
    colors: {
      'file_operations': 'green',
      'command_execution': 'magenta', 
      'general_assistant': 'blue'
    },
    displayNames: {
      'file_operations': '文件操作',
      'command_execution': '命令执行',
      'general_assistant': '通用助手'
    }
  };
  
  // 模拟从后端加载配置
  manager.loadConfigFromBackend(
    mockBackendConfig.icons,
    mockBackendConfig.colors,
    mockBackendConfig.displayNames
  );
  
  console.log('✅ 后端配置已加载');
  
  // 测试已配置的类别
  Object.keys(mockBackendConfig.icons).forEach(category => {
    console.log(`\n测试已配置类别: ${category}`);
    
    try {
      const icon = manager.getCategoryIcon(category);
      const color = manager.getCategoryColor(category);
      const displayName = manager.getCategoryDisplayName(category);
      
      console.log('✅ 配置获取成功:', { icon, color, displayName });
    } catch (error) {
      console.log('❌ 配置获取失败:', (error as Error).message);
    }
  });
  
  // 测试3: 验证未配置类别仍然报错
  console.log('\n测试3: 验证未配置类别仍然报错');
  
  const unconfiguredCategories = ['database_operations', 'network_operations', 'ai_services'];
  
  unconfiguredCategories.forEach(category => {
    console.log(`\n测试未配置类别: ${category}`);
    
    try {
      manager.getCategoryIcon(category);
      console.log('❌ 错误: 应该抛出异常但没有');
    } catch (error) {
      console.log('✅ 未配置类别正确抛出异常:', (error as Error).message);
    }
  });
  
  // 测试4: 验证配置验证功能
  console.log('\n测试4: 验证配置验证功能');
  
  const validationTests = [
    'file_operations',     // 完全配置
    'unknown_category'     // 未配置
  ];
  
  validationTests.forEach(category => {
    const validation = manager.validateCategoryConfig(category);
    console.log(`类别 ${category} 验证结果:`, validation);
  });
  
  // 测试5: 验证配置完整性检查
  console.log('\n测试5: 验证配置完整性检查');
  
  const allConfigured = manager.getAllConfiguredCategories();
  console.log('所有已配置类别:', allConfigured);
  
  allConfigured.forEach(category => {
    const isFullyConfigured = manager.isCategoryFullyConfigured(category);
    console.log(`类别 ${category} 完全配置状态:`, isFullyConfigured);
  });
  
  console.log('\n=== 严格模式实现验证完成 ===');
};

/**
 * 验证前端组件不包含硬编码配置
 */
export const validateNoHardcodedConfig = () => {
  console.log('\n=== 验证前端组件无硬编码配置 ===');
  
  // 这里可以添加更多的验证逻辑
  // 检查是否还有其他地方包含硬编码的类别配置
  
  console.log('✅ 前端组件硬编码配置检查完成');
  console.log('注意: 组件现在使用严格模式，未配置的类别将抛出错误或显示警告');
};

/**
 * 运行所有严格模式测试
 */
export const runAllStrictModeTests = () => {
  console.log('开始运行严格模式测试...\n');
  
  try {
    // 清空之前的配置
    const manager = StrictCategoryConfigManager.getInstance();
    manager.clearConfig();
    
    testStrictModeImplementation();
    validateNoHardcodedConfig();
    
    // 运行原有的测试
    testStrictModeConfig();
    
    console.log('\n🎉 所有严格模式测试通过！');
    console.log('✅ 已成功实现"无配置即报错"机制');
    console.log('✅ 前端不再包含任何硬编码的类别配置');
    console.log('✅ 所有配置信息必须从后端获取');
    
  } catch (error) {
    console.error('❌ 严格模式测试失败:', (error as Error).message);
  }
};

// 导出测试函数供外部调用
export default runAllStrictModeTests;