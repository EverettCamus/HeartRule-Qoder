/**
 * 强制更新脚本 - 直接从文件读取
 */

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

async function main() {
  try {
    // 1. 创建正确的 YAML 文件
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
                content_template: Please enter a question
                output: []
                question_template: 向来访者询问如何称呼
                exit: 收到到来访者的称呼
                target_variable: user_name
                extraction_prompt: 来访者可以接受的称呼
`;

    // 2. 保存到临时文件
    const tempFile = join(process.cwd(), 'temp-script.yaml');
    writeFileSync(tempFile, correctYaml, 'utf-8');
    console.log('✅ Temp file created:', tempFile);
    console.log('Content length:', correctYaml.length);
    console.log('Has require_acknowledgment:', correctYaml.includes('require_acknowledgment'));

    // 3. 从文件读取并更新数据库
    const fileContent = readFileSync(tempFile, 'utf-8');
    
    const result = await db.update(scripts)
      .set({
        scriptContent: fileContent,
        updatedAt: new Date(),
      })
      .where(eq(scripts.scriptName, 'new-session111.yaml'))
      .returning();

    console.log('\n✅ Database updated:', result.length, 'rows');

    // 4. 验证更新
    const updated = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'new-session111.yaml'),
    });

    if (updated) {
      console.log('\n==== Verification ====');
      console.log('Content length:', updated.scriptContent.length);
      console.log('Has require_acknowledgment:', updated.scriptContent.includes('require_acknowledgment'));
      console.log('Updated at:', updated.updatedAt);
      
      console.log('\n==== Content Preview ====');
      console.log(updated.scriptContent.substring(0, 500));
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
