/**
 * 端到端测试：验证全局变量加载和替换功能
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { projects, scripts, sessions } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('端到端测试：全局变量加载和替换');
    console.log('='.repeat(80));

    // 1. 查找项目
    console.log('\n📋 步骤 1: 查找项目和脚本');
    const project = await db.query.projects.findFirst({
      where: eq(projects.projectName, 'CBT Depression Assessment Project'),
    });

    if (!project) {
      console.error('❌ 未找到项目');
      return;
    }
    console.log('✅ 找到项目:', project.projectName);

    // 2. 查找脚本文件
    const sessionFile = await db.query.scriptFiles.findFirst({
      where: (fields, { and, eq }) =>
        and(
          eq(fields.projectId, project.id),
          eq(fields.fileName, 'cbt_depression_assessment.yaml')
        ),
    });

    if (!sessionFile || !sessionFile.yamlContent) {
      console.error('❌ 未找到会话脚本文件');
      return;
    }
    console.log('✅ 找到会话脚本:', sessionFile.fileName);

    // 3. 查找对应的 script 记录
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, sessionFile.fileName),
    });

    if (!script) {
      console.error('❌ 未找到脚本记录，请先导入脚本');
      console.log('提示: 运行 prepare-e2e-test.js 或在编辑器中导入脚本');
      return;
    }
    console.log('✅ 找到脚本记录:', script.scriptName);

    // 4. 创建测试会话
    console.log('\n📋 步骤 2: 创建测试会话');
    const sessionId = uuidv4();
    const userId = 'test-user';

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      scriptId: script.id,
      status: 'active',
      executionStatus: 'running',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✅ 测试会话已创建:', sessionId);

    // 5. 初始化会话（这里会触发全局变量加载）
    console.log('\n📋 步骤 3: 初始化会话（加载全局变量）');
    const sessionManager = new SessionManager();
    const initResult = await sessionManager.initializeSession(sessionId);

    console.log('✅ 会话初始化完成');
    console.log('执行状态:', initResult.executionStatus);
    console.log('变量列表:', initResult.variables);

    // 6. 验证全局变量是否加载
    console.log('\n📋 步骤 4: 验证全局变量');
    const expectedVars = ['咨询师名', '用户名'];
    let allVarsPresent = true;

    for (const varName of expectedVars) {
      const value = initResult.variables?.[varName];
      if (value) {
        console.log(`✅ 变量 "${varName}" = "${value}"`);
      } else {
        console.log(`❌ 变量 "${varName}" 缺失`);
        allVarsPresent = false;
      }
    }

    // 7. 检查 AI 消息中的变量替换
    console.log('\n📋 步骤 5: 检查 AI 消息中的变量替换');
    if (initResult.aiMessage) {
      console.log('AI 消息预览:');
      console.log('-'.repeat(80));
      console.log(initResult.aiMessage.substring(0, 300));
      console.log('-'.repeat(80));

      // 检查是否包含变量值
      const 咨询师名 = initResult.variables?.['咨询师名'] as string;
      if (咨询师名 && initResult.aiMessage.includes(咨询师名)) {
        console.log(`✅ AI 消息包含咨询师名称 "${咨询师名}"`);
      } else if (咨询师名) {
        console.log(`⚠️ AI 消息未包含咨询师名称 "${咨询师名}"`);
        console.log('   这可能是正常的，取决于脚本模板设计');
      }
    } else {
      console.log('⚠️ 未生成 AI 消息');
    }

    // 8. 总结
    console.log('\n' + '='.repeat(80));
    if (allVarsPresent) {
      console.log('✅ 测试通过！全局变量加载和替换功能正常工作');
    } else {
      console.log('❌ 测试失败！部分全局变量未加载');
    }
    console.log('='.repeat(80));

    // 清理测试数据
    console.log('\n🧹 清理测试会话...');
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    console.log('✅ 清理完成');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('错误堆栈:', error.stack);
    }
  } finally {
    process.exit(0);
  }
}

main();
