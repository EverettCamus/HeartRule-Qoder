import { eq, desc } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { sessions, scriptFiles } from './src/db/schema.js';

async function checkSessionConfig() {
  console.log('🔍 Checking recent session execution...\n');

  // 获取最近的session
  const recentSessions = await db
    .select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt))
    .limit(3);

  for (const session of recentSessions) {
    console.log(`📋 Session ID: ${session.id}`);
    console.log(`   Script ID: ${session.scriptId}`);
    console.log(`   Status: ${session.status}`);

    // 检查 metadata 中的 sessionConfig
    const metadata = session.metadata as any;
    if (metadata?.sessionConfig) {
      console.log('   ✅ Found sessionConfig in metadata:');
      console.log('      template_scheme:', metadata.sessionConfig.template_scheme);
    } else {
      console.log('   ❌ No sessionConfig in metadata');
    }

    // 检查对应的脚本内容
    if (session.scriptId) {
      const [script] = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.id, session.scriptId));

      if (script) {
        const content = (script.fileContent as any)?.content || (script.fileContent as any)?.yaml;
        if (content && content.includes('template_scheme')) {
          const match = content.match(/template_scheme:\s*["']?(\w+)["']?/);
          console.log('   📄 Script template_scheme:', match ? match[1] : 'not found');
        } else {
          console.log('   📄 Script has no template_scheme');
        }
      }
    }

    console.log('');
  }

  process.exit(0);
}

checkSessionConfig().catch(console.error);
