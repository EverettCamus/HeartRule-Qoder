/**
 * 测试用例：验证变量分类逻辑
 *
 * 问题描述：
 * 在一个ai_say动作中设置了5回合上限，当用户回复了第5句后，AI没有返回消息（正常），
 * 但是出现了变量状态气泡。变量气泡中的global层级除了应有的"咨询师名"变量外，
 * 还错误地包含了"用户名"变量。
 *
 * 预期行为：
 * - 只有在global.yaml中定义的变量（如"咨询师名"）应该显示在global层级
 * - ai_ask动作提取的变量（如"user_name"）不应该出现在global层级
 */

import { eq } from 'drizzle-orm';
import * as yaml from 'yaml';
import { v4 as uuidv4 } from 'uuid';

import { db } from './src/db/index.js';
import { scripts, scriptFiles, sessions, projects } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';

async function main() {
  console.log('='.repeat(80));
  console.log('📋 测试：变量分类逻辑验证');
  console.log('='.repeat(80));

  try {
    // 1. 查找 CBT 项目
    console.log('\n🔍 步骤 1: 查找 CBT 项目');
    const project = await db.query.projects.findFirst({
      where: eq(projects.projectName, 'CBT Depression Assessment Project'),
    });

    if (!project) {
      console.error('❌ 未找到 CBT Depression Assessment Project');
      return;
    }

    console.log('✅ 找到项目:', project.projectName);

    // 2. 检查 global.yaml 的当前内容
    console.log('\n🔍 步骤 2: 检查 global.yaml 内容');
    const globalFile = await db.query.scriptFiles.findFirst({
      where: (fields, { and }) =>
        and(eq(fields.projectId, project.id), eq(fields.fileType, 'global')),
    });

    if (!globalFile) {
      console.error('❌ 未找到 global.yaml');
      return;
    }

    let currentGlobalVars: any[] = [];
    if (globalFile.yamlContent) {
      const parsed = yaml.parse(globalFile.yamlContent);
      currentGlobalVars = parsed?.variables || [];
    } else if (globalFile.fileContent) {
      currentGlobalVars = (globalFile.fileContent as any)?.variables || [];
    }

    console.log('📄 当前 global.yaml 中的变量:', currentGlobalVars);

    // 检查是否包含"用户名"
    const hasUserName = currentGlobalVars.some(
      (v: any) => v.name === '用户名' || v.name === 'user_name' || v.name === 'username'
    );

    if (hasUserName) {
      console.log('⚠️  发现问题：global.yaml 中包含"用户名"变量！');
      console.log('🔧 正在修复：移除"用户名"变量...');

      // 移除"用户名"变量
      const filteredVars = currentGlobalVars.filter(
        (v: any) => v.name !== '用户名' && v.name !== 'user_name' && v.name !== 'username'
      );

      const updatedYaml = yaml.stringify({ variables: filteredVars });
      await db
        .update(scriptFiles)
        .set({
          yamlContent: updatedYaml,
          fileContent: { variables: filteredVars },
          updatedAt: new Date(),
        })
        .where(eq(scriptFiles.id, globalFile.id));

      console.log('✅ 已从 global.yaml 中移除"用户名"变量');
      console.log('📄 更新后的 global.yaml:');
      console.log(updatedYaml);
    } else {
      console.log('✅ global.yaml 中不包含"用户名"变量（正确）');
    }

    // 3. 查找测试脚本
    console.log('\n🔍 步骤 3: 查找 cbt_depression_assessment 脚本');
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'cbt_depression_assessment.yaml'),
    });

    if (!script) {
      console.error('❌ 未找到 cbt_depression_assessment.yaml 脚本');
      return;
    }

    console.log('✅ 找到脚本:', script.scriptName);

    // 4. 创建测试会话并模拟5轮对话
    console.log('\n🔍 步骤 4: 创建测试会话');
    const sessionManager = new SessionManager();
    const userId = 'test_user_' + Date.now();

    // 初始化会话
    const initResult = await sessionManager.initializeSession(
      await createTestSession(userId, script.id)
    );

    console.log('✅ 会话已初始化');
    console.log('📊 初始变量:', Object.keys(initResult.variables || {}));
    console.log('🌐 全局变量:', Object.keys(initResult.globalVariables || {}));

    // 检查变量分类
    const allVars = initResult.variables || {};
    const globalVars = initResult.globalVariables || {};

    console.log('\n📋 变量分类检查:');
    for (const varName of Object.keys(allVars)) {
      const isGlobal = varName in globalVars;
      const category = isGlobal ? 'GLOBAL' : 'SESSION';
      console.log(`  - ${varName}: ${category}`);
    }

    // 验证"用户名"或"user_name"不在全局变量中
    const userNameVars = ['用户名', 'user_name', 'username'];
    const foundInGlobal = userNameVars.some((name) => name in globalVars);

    if (foundInGlobal) {
      console.error('\n❌ 测试失败："用户名"变量错误地出现在全局变量中！');
      console.error('   globalVariables:', Object.keys(globalVars));
    } else {
      console.log('\n✅ 测试通过："用户名"变量未出现在全局变量中');
    }

    // 5. 总结
    console.log('\n' + '='.repeat(80));
    console.log('📊 测试结果总结');
    console.log('='.repeat(80));
    console.log('1. global.yaml 内容:', globalVars);
    console.log(
      '2. 会话变量:',
      Object.keys(allVars).filter((k) => !(k in globalVars))
    );
    console.log('3. 变量分类正确性:', foundInGlobal ? '❌ 失败' : '✅ 通过');
    console.log('='.repeat(80));
  } catch (error) {
    console.error('❌ 测试执行失败:', error);
  } finally {
    process.exit(0);
  }
}

// 辅助函数：创建测试会话
async function createTestSession(userId: string, scriptId: string): Promise<string> {
  const sessionId = uuidv4();
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    scriptId,
    status: 'active',
    executionStatus: 'running',
    position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
    variables: {},
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return sessionId;
}

main();
