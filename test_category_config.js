const { invoke } = require('@tauri-apps/api/core');

async function testCategoryConfig() {
  try {
    console.log('🔍 Testing tool category configuration...\n');
    
    // Get all enabled categories
    const categories = await invoke('get_enabled_categories');
    console.log('✅ Retrieved categories:', categories.length, 'items');
    
    // Check configuration for each category
    for (const category of categories) {
      console.log(`\n📁 Category: ${category.name}`);
      console.log(`   ID: ${category.id}`);
      console.log(`   Display Name: ${category.display_name}`);
      console.log(`   Description: ${category.description}`);
      console.log(`   Icon: ${category.icon}`);
      console.log(`   Enabled Status: ${category.enabled}`);
      console.log(`   Strict Mode: ${category.strict_tools_mode}`);
      console.log(`   Category Type: ${category.category_type}`);
    }
    
    // Check specific categories
    const testCategories = ['command_execution', 'file_operations', 'general_assistant'];
    
    console.log('\n🔍 Verifying specific category configurations...');
    for (const categoryId of testCategories) {
      const category = await invoke('get_tool_category_info', { categoryId });
      if (category) {
        console.log(`\n✅ ${categoryId}:`);
        console.log(`   Display Name: ${category.display_name}`);
        console.log(`   Icon: ${category.icon}`);
        console.log(`   Description: ${category.description}`);
      } else {
        console.log(`\n❌ ${categoryId}: Configuration not found`);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Note: This script needs to run in Tauri application environment
console.log('⚠️  This script needs to run in Tauri application environment to access invoke API');
console.log('📝 Please run corresponding code in browser console for testing');