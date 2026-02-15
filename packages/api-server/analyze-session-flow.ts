import { eq } from 'drizzle-orm';

import { db } from './src/db/index.js';
import { sessions, scripts } from './src/db/schema.js';

/**
 * 分析会话创建流程和工程绑定问题
 *
 * 问题现象：
 * 1. 用户在 test999 工程（6d38fcc6...）中调试 hello-world.yaml
 * 2. 但系统使用 test project22（0042aed9...）的模板
 *
 * 需要确认：
 * 1. Session 创建时的 scriptId
 * 2. Script 的 tags 中的 projectId
 * 3. Session 的 metadata.projectId
 */
async function analyzeSessionFlow() {
  console.log('🔍 分析会话创建流程\n');
  console.log('='.repeat(80));

  // 从日志中提取的会话ID
  const sessionId = '5f962044-bf31-49be-a426-44953afb16bf';

  console.log(`\n📋 会话信息: ${sessionId}`);

  // 1. 查询会话
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));

  if (!session) {
    console.log('❌ 会话不存在');
    return;
  }

  console.log('\n会话记录:');
  console.log(`  - scriptId: ${session.scriptId}`);
  console.log(`  - metadata:`, JSON.stringify(session.metadata, null, 2));
  console.log(`  - createdAt: ${session.createdAt}`);

  // 2. 查询脚本
  const [script] = await db.select().from(scripts).where(eq(scripts.id, session.scriptId));

  if (!script) {
    console.log(`\n❌ 脚本不存在: ${session.scriptId}`);
    return;
  }

  console.log('\n脚本记录:');
  console.log(`  - scriptName: ${script.scriptName}`);
  console.log(`  - tags:`, script.tags);

  // 从 tags 中提取 projectId
  const tags = (script.tags as string[]) || [];
  const projectTag = tags.find((tag) => tag.startsWith('project:'));
  const projectIdFromTags = projectTag ? projectTag.replace('project:', '') : undefined;

  console.log(`  - projectId (from tags): ${projectIdFromTags || 'NONE'}`);

  // 3. 对比分析
  console.log('\n' + '='.repeat(80));
  console.log('🎯 问题诊断:\n');

  const sessionProjectId = (session.metadata as any)?.projectId;

  console.log(`1. Session.metadata.projectId: ${sessionProjectId || 'NONE'}`);
  console.log(`2. Script.tags projectId: ${projectIdFromTags || 'NONE'}`);
  console.log(`3. 期望的 projectId: 6d38fcc6-977b-423f-abc5-6b590e1942e5 (test999)`);

  if (projectIdFromTags === '0042aed9-a756-4bbf-95f4-3ec355feb651') {
    console.log('\n❌ 根本原因：');
    console.log('   Script 的 tags 中保存的 projectId 是 test project22 的！');
    console.log('   这说明该 hello-world.yaml 脚本属于 test project22 工程');
    console.log('   即使用户在前端切换到 test999 工程，使用的仍然是旧工程的脚本');
  }

  // 4. 查找 test999 工程的脚本
  console.log('\n' + '='.repeat(80));
  console.log('🔍 查找 test999 工程的脚本:\n');

  const test999ProjectId = '6d38fcc6-977b-423f-abc5-6b590e1942e5';

  const test999Scripts = await db
    .select()
    .from(scripts)
    .where(eq(scripts.scriptName, 'hello-world.yaml'));

  console.log(`找到 ${test999Scripts.length} 个 hello-world.yaml 脚本:\n`);

  for (const s of test999Scripts) {
    const sTags = (s.tags as string[]) || [];
    const sProjectTag = sTags.find((tag) => tag.startsWith('project:'));
    const sProjectId = sProjectTag ? sProjectTag.replace('project:', '') : undefined;

    console.log(`  - Script ID: ${s.id}`);
    console.log(`    ProjectId: ${sProjectId}`);
    console.log(`    CreatedAt: ${s.createdAt}`);

    if (sProjectId === test999ProjectId) {
      console.log('    ✅ 这是 test999 工程的脚本！');

      // 检查是否有 leo 模板配置
      const scriptContent = s.scriptContent;
      if (typeof scriptContent === 'string' && scriptContent.includes('template_scheme')) {
        const match = scriptContent.match(/template_scheme:\s*["']?(\w+)["']?/);
        if (match) {
          console.log(`    📋 template_scheme: ${match[1]}`);
        }
      }
    } else {
      console.log(`    ⚠️  这是其他工程的脚本 (${sProjectId})`);
    }
    console.log('');
  }

  // 5. 解决方案
  console.log('='.repeat(80));
  console.log('✅ 解决方案:\n');
  console.log('1. 用户在前端必须明确选择 test999 工程的 hello-world.yaml 脚本');
  console.log('2. 前端需要显示脚本所属的工程信息，避免混淆');
  console.log('3. 创建会话时必须使用正确的 scriptId');
  console.log('\n如果 test999 工程没有 hello-world.yaml 脚本：');
  console.log('4. 需要在 test999 工程中创建新的 hello-world.yaml 脚本');
  console.log('5. 或者复制现有脚本到 test999 工程');

  process.exit(0);
}

analyzeSessionFlow().catch(console.error);
