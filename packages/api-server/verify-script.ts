/**
 * 验证脚本更新结果
 */

import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function main() {
  console.log('🔍 验证脚本更新结果...\n');

  try {
    // 查询所有 session 类型的脚本文件
    const sessionFiles = await db
      .select()
      .from(scriptFiles)
      .where(eq(scriptFiles.fileType, 'session'));

    const targetFile = sessionFiles[0];

    console.log('📄 文件信息:');
    console.log(`   文件名: ${targetFile.fileName}`);
    console.log(`   文件ID: ${targetFile.id}`);
    console.log(`   项目ID: ${targetFile.projectId}`);
    console.log(`   更新时间: ${targetFile.updatedAt}\n`);

    const content = targetFile.fileContent as any;

    console.log('📊 脚本结构:');
    console.log(`   Session ID: ${content.session?.session_id}`);
    console.log(`   Session 名称: ${content.session?.session_name}`);
    console.log(`   Phases 数量: ${content.session?.phases?.length || 0}\n`);

    // 遍历所有 Phase 和 Action
    let actionCount = 0;
    content.session?.phases?.forEach((phase: any, pIndex: number) => {
      console.log(`${pIndex + 1}. Phase: ${phase.phase_name} (${phase.phase_id})`);
      phase.topics?.forEach((topic: any, tIndex: number) => {
        console.log(`   ${pIndex + 1}.${tIndex + 1} Topic: ${topic.topic_name}`);
        topic.actions?.forEach((action: any, _aIndex: number) => {
          actionCount++;
          console.log(`      [${actionCount}] ${action.action_type} - ${action.action_id}`);
          if (action.action_type === 'ai_say') {
            const preview = action.config.content_template.split('\n')[0].substring(0, 50);
            console.log(`          内容: "${preview}..."`);
          } else if (action.action_type === 'ai_ask') {
            console.log(`          问题: "${action.config.question_template}"`);
            // 优先显示 output 数组，向后兼容 target_variable
            if (action.config.output?.length > 0) {
              const varNames = action.config.output.map((o: any) => o.get).join(', ');
              console.log(`          变量(output): ${varNames}`);
            } else if (action.config.target_variable) {
              console.log(`          变量(legacy): ${action.config.target_variable}`);
            }
          } else if (action.action_type === 'ai_think') {
            console.log(`          目标: "${action.config.think_goal}"`);
          }
        });
      });
      console.log('');
    });

    console.log(`✅ 总计: ${actionCount} 个 Action 节点\n`);

    // 显示 YAML 内容的一部分
    if (targetFile.yamlContent) {
      console.log('📝 YAML 内容预览:');
      const lines = targetFile.yamlContent.split('\n');
      console.log(lines.slice(0, 20).join('\n'));
      console.log(`... (共 ${lines.length} 行)\n`);
    }
  } catch (error) {
    console.error('❌ 验证失败:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

main();
