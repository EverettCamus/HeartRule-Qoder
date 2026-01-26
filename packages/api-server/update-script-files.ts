/**
 * 更新 script_files 表中的 YAML 内容
 */

import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function main() {
  try {
    // 查找 new-session111.yaml 文件
    const file = await db.query.scriptFiles.findFirst({
      where: eq(scriptFiles.fileName, 'new-session111.yaml'),
    });

    if (!file) {
      console.log('❌ File not found in script_files table');
      process.exit(1);
    }

    console.log('✅ File found:', {
      id: file.id,
      fileName: file.fileName,
      projectId: file.projectId,
      currentYamlLength: file.yamlContent?.length || 0,
    });

    // 正确的 YAML 内容
    const correctYaml = `session:
  session_id: skills
  session_name: skills
  phases:
    - phase_id: phase_1
      phase_name: New Phase 1
      topics:
        - topic_id: topic_1
          topic_name: New Topic 1
          declare: []
          actions:
            - action_id: action_1
              action_type: ai_say
              config:
                content_template: 向来访者问候，表示欢迎来到游心谷这个世界。
                require_acknowledgment: true
                max_rounds: 1
            - action_id: action_2
              action_type: ai_ask
              config:
                question_template: 向来访者询问如何称呼
                exit: 收到来访者的称呼
                output:
                  - get: user_name
                    define: 来访者可以接受的称呼
`;

    // 更新数据库
    await db.update(scriptFiles)
      .set({
        yamlContent: correctYaml,
        updatedAt: new Date(),
      })
      .where(eq(scriptFiles.id, file.id));

    console.log('\n✅ script_files updated successfully!');

    // 验证更新
    const updated = await db.query.scriptFiles.findFirst({
      where: eq(scriptFiles.id, file.id),
    });

    if (updated) {
      console.log('\n==== Verification ====');
      console.log('New YAML length:', updated.yamlContent?.length || 0);
      console.log('Has require_acknowledgment:', updated.yamlContent?.includes('require_acknowledgment'));
      console.log('\n==== Content Preview ====');
      console.log(updated.yamlContent?.substring(0, 400));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
