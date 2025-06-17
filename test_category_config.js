const { invoke } = require('@tauri-apps/api/core');

async function testCategoryConfig() {
  try {
    console.log('🔍 测试工具类别配置...\n');
    
    // 获取所有启用的类别
    const categories = await invoke('get_enabled_categories');
    console.log('✅ 获取到的类别:', categories.length, '个');
    
    // 检查每个类别的配置
    for (const category of categories) {
      console.log(`\n📁 类别: ${category.name}`);
      console.log(`   ID: ${category.id}`);
      console.log(`   显示名称: ${category.display_name}`);
      console.log(`   描述: ${category.description}`);
      console.log(`   图标: ${category.icon}`);
      console.log(`   启用状态: ${category.enabled}`);
      console.log(`   严格模式: ${category.strict_tools_mode}`);
      console.log(`   类别类型: ${category.category_type}`);
    }
    
    // 检查特定类别
    const testCategories = ['command_execution', 'file_operations', 'general_assistant'];
    
    console.log('\n🔍 验证特定类别配置...');
    for (const categoryId of testCategories) {
      const category = await invoke('get_tool_category_info', { categoryId });
      if (category) {
        console.log(`\n✅ ${categoryId}:`);
        console.log(`   显示名称: ${category.display_name}`);
        console.log(`   图标: ${category.icon}`);
        console.log(`   描述: ${category.description}`);
      } else {
        console.log(`\n❌ ${categoryId}: 未找到配置`);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

// 注意：这个脚本需要在Tauri应用环境中运行
console.log('⚠️  此脚本需要在Tauri应用环境中运行以访问invoke API');
console.log('📝 请在浏览器控制台中运行相应的代码来测试');