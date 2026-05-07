import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';

async function checkScriptTags() {
  const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';

  const [script] = await db.select().from(scripts).where(eq(scripts.id, scriptId));

  if (!script) {
    console.log('❌ 脚本不存在');
    process.exit(1);
  }

  console.log('📋 脚本信息:\n');
  console.log(`scriptId: ${script.id}`);
  console.log(`scriptName: ${script.scriptName}`);
  console.log(`tags:`, script.tags);

  const tags = (script.tags as string[]) || [];
  const projectTag = tags.find((tag) => tag.startsWith('project:'));
  const projectId = projectTag ? projectTag.replace('project:', '') : undefined;

  console.log(`\nprojectId (from tags): ${projectId}`);

  console.log('\n期望的 projectId: 6d38fcc6-977b-423f-abc5-6b590e1942e5 (test999)');
  console.log(`实际的 projectId: ${projectId}`);

  if (projectId === '6d38fcc6-977b-423f-abc5-6b590e1942e5') {
    console.log('\n✅ 脚本确实属于 test999 工程！');
  } else {
    console.log('\n❌ 脚本不属于 test999 工程！');
    console.log(`   实际归属: ${projectId}`);
  }

  process.exit(0);
}

checkScriptTags().catch(console.error);
