import { eq, and } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

async function checkScriptMaxRounds() {
  const projectId = '024c31e4-9828-4928-814f-250d38d664ec';
  const scriptId = 'ef45f366-b271-4696-870c-44db13d465f7';

  console.log('查询脚本记录...');
  const [record] = await db
    .select()
    .from(scriptFiles)
    .where(and(eq(scriptFiles.projectId, projectId), eq(scriptFiles.id, scriptId)));

  if (!record) {
    console.log('❌ 未找到脚本记录');
    process.exit(1);
  }

  console.log('\n✅ 脚本记录存在');
  console.log('fileContent 类型:', typeof record.fileContent);
  console.log('fileContent 键:', Object.keys(record.fileContent || {}));

  const content = (record.fileContent as any)?.content || (record.fileContent as any)?.yaml;
  if (!content) {
    console.log('❌ 无法获取脚本内容');
    process.exit(1);
  }

  console.log('\n脚本内容长度:', content.length);
  console.log('\n查找 say_welcome 配置:');
  const sayWelcomeMatch = content.match(/action_id:\s*say_welcome[\s\S]{0,500}/);
  if (sayWelcomeMatch) {
    console.log(sayWelcomeMatch[0]);
  }

  console.log('\n查找 max_rounds:');
  const maxRoundsMatches = content.match(/max_rounds:\s*\d+/g);
  if (maxRoundsMatches) {
    console.log('找到的 max_rounds 配置:', maxRoundsMatches);
  } else {
    console.log('❌ 未找到任何 max_rounds 配置');
  }

  process.exit(0);
}

checkScriptMaxRounds().catch((error) => {
  console.error('执行失败:', error);
  process.exit(1);
});
