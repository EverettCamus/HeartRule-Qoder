/**
 * 检查数据库中的脚本解析状态
 */

import { db } from './src/db/index.js';

async function checkScripts() {
  console.log('🔍 Checking scripts in database...\n');

  const allScripts = await db.query.scripts.findMany({
    limit: 10,
  });

  console.log(`Found ${allScripts.length} scripts in database:\n`);

  for (const script of allScripts) {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Script ID: ${script.id}`);
    console.log(`Name: ${script.scriptName}`);
    console.log(`Type: ${script.scriptType}`);
    console.log(`Has parsedContent: ${!!script.parsedContent}`);

    if (script.parsedContent) {
      const parsed = script.parsedContent as any;
      console.log('ParsedContent structure:');
      console.log(`  - Keys: ${Object.keys(parsed).join(', ')}`);

      if (parsed.session) {
        console.log(`  - session.session_name: ${parsed.session.session_name}`);
        console.log(`  - session.phases count: ${parsed.session.phases?.length || 0}`);

        if (parsed.session.phases && parsed.session.phases.length > 0) {
          const phase = parsed.session.phases[0];
          console.log(`  - First phase: ${phase.phase_name}`);
          console.log(`    - Topics count: ${phase.topics?.length || 0}`);

          if (phase.topics && phase.topics.length > 0) {
            const topic = phase.topics[0];
            console.log(`    - First topic: ${topic.topic_name}`);
            console.log(`      - Actions count: ${topic.actions?.length || 0}`);
          }
        }
      } else {
        console.log('  - No "session" key, checking for "phases" directly...');
        if (parsed.phases) {
          console.log(`  - phases count: ${parsed.phases.length}`);
        }
      }
    } else {
      console.log('❌ parsedContent is NULL');
      console.log(`Content length: ${script.scriptContent?.length || 0} characters`);
      console.log(`Content preview: ${script.scriptContent?.substring(0, 100)}...`);
    }
    console.log('');
  }

  process.exit(0);
}

checkScripts().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
