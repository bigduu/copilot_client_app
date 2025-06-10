/**
 * 测试严格模式验证逻辑的工具函数
 */

import { ToolCategoryInfo, ToolCategoryService } from '../types/toolCategory';

// 创建测试用的工具类别信息
const createTestCategory = (strictMode: boolean): ToolCategoryInfo => ({
  id: 'test_category',
  name: '测试类别',
  description: '用于测试的工具类别',
  system_prompt: '测试系统提示',
  tools: ['test_tool'],
  restrict_conversation: false,
  enabled: true,
  strict_tools_mode: strictMode,
});

// 测试用例
export const runStrictModeTests = () => {
  const service = ToolCategoryService.getInstance();
  
  console.log('开始测试严格模式验证逻辑...');

  // 测试非严格模式
  const normalCategory = createTestCategory(false);
  const normalTest1 = service.validateMessageForStrictMode('普通消息', normalCategory);
  const normalTest2 = service.validateMessageForStrictMode('/tool_call', normalCategory);
  
  console.log('非严格模式测试:', {
    普通消息: normalTest1,
    工具调用: normalTest2
  });

  // 测试严格模式
  const strictCategory = createTestCategory(true);
  const strictTest1 = service.validateMessageForStrictMode('普通消息', strictCategory);
  const strictTest2 = service.validateMessageForStrictMode('/tool_call', strictCategory);
  const strictTest3 = service.validateMessageForStrictMode('/', strictCategory);
  const strictTest4 = service.validateMessageForStrictMode('/read_file example.txt', strictCategory);

  console.log('严格模式测试:', {
    普通消息: strictTest1,
    有效工具调用: strictTest2,
    无效工具调用: strictTest3,
    完整工具调用: strictTest4
  });

  // 测试空类别
  const nullTest = service.validateMessageForStrictMode('任意消息', null);
  console.log('空类别测试:', nullTest);

  console.log('严格模式验证逻辑测试完成！');
};