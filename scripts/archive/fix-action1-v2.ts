/**
 * 修复 action_1 的配置（v2 - 直接拼接 YAML）
 */

import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

async function main() {
  try {
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'new-session111.yaml'),
    });

    if (!script) {
      console.log('❌ Script not found');
      return;
    }

    console.log('✅ Script found, replacing content...');

    // 直接使用正确的 YAML 内容
    const fixedYaml = `session:
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
                content_template: Please enter a question
                output: []
                question_template: 向来访者询问如何称呼
                exit: 收到到来访者的称呼
                target_variable: user_name
                extraction_prompt: 来访者可以接受的称呼
`;

    // 更新数据库
    await db.update(scripts)
      .set({
        scriptContent: fixedYaml,
        updatedAt: new Date(),
      })
      .where(eq(scripts.id, script.id));

    console.log('✅ Script updated successfully!');
    console.log('\n==== Verification ====');
    
    // 验证更新
    const updated = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'new-session111.yaml'),
    });
    
    if (updated) {
      console.log('Content length:', updated.scriptContent.length);
      console.log('Contains require_acknowledgment:', updated.scriptContent.includes('require_acknowledgment'));
      console.log('\n==== Updated Content ====\n');
      console.log(updated.scriptContent);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
