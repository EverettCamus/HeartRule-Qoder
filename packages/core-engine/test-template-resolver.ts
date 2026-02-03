/**
 * 测试两层模板机制的核心功能
 * 
 * 验证目标：
 * 1. TemplateResolver 能否正确解析 default 层模板
 * 2. TemplateResolver 能否正确解析 custom 层模板
 * 3. 回退机制是否正常工作（custom 不存在时回退到 default）
 */

import { TemplateResolver } from './src/engines/prompt-template/template-resolver';
import path from 'path';

async function testTemplateResolver() {
  console.log('========================================');
  console.log('测试两层模板机制');
  console.log('========================================\n');

  // 项目根目录
  const projectPath = path.resolve(process.cwd(), '../..');
  console.log('项目路径:', projectPath);

  const resolver = new TemplateResolver(projectPath);

  // 测试1: 使用 default 层（不配置 template_scheme）
  console.log('\n--- 测试1: Default 层模板 ---');
  try {
    const result1 = await resolver.resolveTemplatePath('ai_ask');
    console.log('✓ 解析成功');
    console.log('  路径:', result1.path);
    console.log('  层级:', result1.layer);
    console.log('  存在:', result1.exists);
  } catch (error: any) {
    console.error('✗ 解析失败:', error.message);
  }

  // 测试2: 使用 custom 层（配置 template_scheme）
  console.log('\n--- 测试2: Custom 层模板（crisis_intervention）---');
  try {
    const result2 = await resolver.resolveTemplatePath('ai_ask', {
      template_scheme: 'crisis_intervention'
    });
    console.log('✓ 解析成功');
    console.log('  路径:', result2.path);
    console.log('  层级:', result2.layer);
    console.log('  方案:', result2.scheme);
    console.log('  存在:', result2.exists);
  } catch (error: any) {
    console.error('✗ 解析失败:', error.message);
  }

  // 测试3: 回退机制（custom 层不存在，回退到 default）
  console.log('\n--- 测试3: 回退机制（custom 层不存在的 ai_say）---');
  try {
    const result3 = await resolver.resolveTemplatePath('ai_say', {
      template_scheme: 'crisis_intervention'
    });
    console.log('✓ 解析成功（已回退到 default 层）');
    console.log('  路径:', result3.path);
    console.log('  层级:', result3.layer);
    console.log('  存在:', result3.exists);
  } catch (error: any) {
    console.error('✗ 解析失败:', error.message);
  }

  // 测试4: 不存在的 template_scheme
  console.log('\n--- 测试4: 不存在的方案（应回退到 default）---');
  try {
    const result4 = await resolver.resolveTemplatePath('ai_ask', {
      template_scheme: 'non_existent_scheme'
    });
    console.log('✓ 解析成功（已回退到 default 层）');
    console.log('  路径:', result4.path);
    console.log('  层级:', result4.layer);
    console.log('  存在:', result4.exists);
  } catch (error: any) {
    console.error('✗ 解析失败:', error.message);
  }

  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================');
}

// 执行测试
testTemplateResolver().catch(console.error);
