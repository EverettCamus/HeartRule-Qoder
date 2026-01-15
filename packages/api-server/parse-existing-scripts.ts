/**
 * 解析数据库中现有脚本的 YAML 内容
 * 将 parsedContent 字段从 NULL 更新为解析后的对象
 */

import { eq } from 'drizzle-orm';
import * as yaml from 'yaml';

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

async function parseExistingScripts() {
  console.log('🔄 Parsing existing scripts...\n');

  const allScripts = await db.query.scripts.findMany();

  console.log(`Found ${allScripts.length} scripts in database\n`);

  let successCount = 0;
  let failCount = 0;
  let alreadyParsedCount = 0;

  for (const script of allScripts) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Script: ${script.scriptName}`);
    console.log(`ID: ${script.id}`);

    if (script.parsedContent) {
      console.log('✓ Already parsed, skipping');
      alreadyParsedCount++;
      continue;
    }

    try {
      const parsed = yaml.parse(script.scriptContent);

      await db
        .update(scripts)
        .set({
          parsedContent: parsed,
          updatedAt: new Date(),
        })
        .where(eq(scripts.id, script.id));

      console.log('✅ Successfully parsed and updated');

      // 显示解析后的结构
      const keys = Object.keys(parsed);
      console.log(`   Structure: ${keys.join(', ')}`);

      if (parsed.session) {
        console.log(`   - session.session_name: ${parsed.session.session_name}`);
        console.log(`   - session.phases: ${parsed.session.phases?.length || 0} phases`);
      } else if (parsed.phases) {
        console.log(`   - phases: ${parsed.phases.length} phases`);
      }

      successCount++;
    } catch (error) {
      console.error('❌ Failed to parse:', (error as Error).message);
      failCount++;
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📊 Summary:');
  console.log(`✅ Successfully parsed: ${successCount}`);
  console.log(`⏭️  Already parsed: ${alreadyParsedCount}`);
  console.log(`❌ Failed to parse: ${failCount}`);
  console.log(`📝 Total: ${allScripts.length}`);

  process.exit(0);
}

parseExistingScripts().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
