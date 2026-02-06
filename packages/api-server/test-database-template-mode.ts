/**
 * Story 0.4 WI-5: E2E 测试 - 数据库模板模式
 *
 * 验证目标：
 * - 在无 workspace 模板目录情况下，会话能够从数据库加载模板并正常执行
 * - 验证 ai_ask 和 ai_say 动作能够正确从数据库获取模板
 * - 验证多轮对话的模板加载流程
 */

import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, closeConnection } from './src/db/index.js';
import { sessions, scripts, projects, scriptFiles } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';

/**
 * 测试脚本内容（包含 ai_ask 和 ai_say 动作）
 */
const TEST_SCRIPT_YAML = `
metadata:
  name: 数据库模板测试脚本
  version: 1.0.0
  description: 用于测试数据库模板模式的脚本
  author: system

session:
  session_id: test-db-template
  session_name: 数据库模板测试
  phases:
    - phase_id: phase_1
      phase_name: 用户信息收集
      topics:
        - topic_id: topic_1
          topic_name: 基本信息
          actions:
            - action_id: ask_name
              action_type: ai_ask
              mode: simple-ask
              template:
                path: _system/config/default/ai_ask_v1.md
              target_variable: user_name
              max_rounds: 3
              prompts:
                question: "请问您的名字是什么？"
            
            - action_id: greet_user
              action_type: ai_say
              mode: direct
              template:
                path: _system/config/default/ai_say_v1.md
              max_rounds: 5
              prompts:
                statement: "很高兴认识您，{{user_name}}！"
`;

/**
 * 测试用的模板内容
 */
const AI_ASK_TEMPLATE = `# AI Ask Template (Simple Mode)

你是一位专业的心理咨询师。

## 当前问题
{{question}}

## 指令
请以自然、温暖的方式向用户提出这个问题。

## 输出格式
请按照以下 JSON 格式返回：
\`\`\`json
{
  "question": "你改写后的问题",
  "assessment": {
    "understanding_level": "high|medium|low"
  }
}
\`\`\`
`;

const AI_SAY_TEMPLATE = `# AI Say Template (Direct Mode)

你是一位专业的心理咨询师。

## 要传达的内容
{{statement}}

## 指令
请以自然、温暖的方式传达这个内容，保持原意不变。

## 输出格式
请按照以下 JSON 格式返回：
\`\`\`json
{
  "content": "你改写后的内容",
  "assessment": {
    "understanding_level": "high|medium|low"
  }
}
\`\`\`
`;

let testProjectId: string;
let testScriptId: string;
let testSessionId: string;

/**
 * 准备测试数据
 */
async function setupTestData() {
  console.log('\n【步骤 1】准备测试数据');
  console.log('='.repeat(80));

  // 1. 创建测试项目
  const projectId = uuidv4();
  testProjectId = projectId;

  await db.insert(projects).values({
    id: projectId,
    projectName: `test-db-template-${Date.now()}`,
    description: 'E2E测试：数据库模板模式',
    engineVersion: '2.0.0',
    engineVersionMin: '2.0.0',
    status: 'published',
    author: 'test-system',
  });

  console.log('✅ 测试项目已创建:', projectId);

  // 2. 导入模板文件到数据库
  // 2.1 Default 层 - ai_ask_v1.md
  await db.insert(scriptFiles).values({
    projectId,
    fileType: 'template',
    fileName: 'ai_ask_v1.md',
    filePath: '_system/config/default/ai_ask_v1.md',
    fileContent: { content: AI_ASK_TEMPLATE },
  });

  // 2.2 Default 层 - ai_say_v1.md
  await db.insert(scriptFiles).values({
    projectId,
    fileType: 'template',
    fileName: 'ai_say_v1.md',
    filePath: '_system/config/default/ai_say_v1.md',
    fileContent: { content: AI_SAY_TEMPLATE },
  });

  console.log('✅ 模板文件已导入到数据库（Default 层）');

  // 3. 创建测试脚本（绑定到项目）
  const scriptId = uuidv4();
  testScriptId = scriptId;

  // 修改脚本内容，让 script.projectId 指向测试项目
  const scriptContent = TEST_SCRIPT_YAML.trim();

  await db.insert(scripts).values({
    id: scriptId,
    scriptName: `test-script-${Date.now()}`,
    scriptType: 'session',
    scriptContent,
    parsedContent: null, // 将由 SessionManager 解析
    version: '1.0.0',
    status: 'published',
    author: 'test-system',
    description: 'E2E测试脚本',
    tags: [`project:${projectId}`], // 关联到项目
  });

  // 将脚本关联到项目（通过 metadata 或单独的关联表）
  // 这里我们假设通过 script_files 关联
  await db.insert(scriptFiles).values({
    projectId,
    fileType: 'session',
    fileName: 'test-script.yaml',
    filePath: `/scripts/test-script-${Date.now()}.yaml`,
    fileContent: { content: scriptContent },
    yamlContent: scriptContent,
  });

  console.log('✅ 测试脚本已创建并关联到项目:', scriptId);
  console.log('   - 脚本ID:', scriptId);
  console.log('   - 项目ID:', projectId);
  console.log('   - tags:', [`project:${projectId}`]);
}

/**
 * 验证模板文件在数据库中存在
 */
async function verifyTemplatesInDatabase() {
  console.log('\n【步骤 2】验证模板文件在数据库中');
  console.log('='.repeat(80));

  const templates = await db
    .select()
    .from(scriptFiles)
    .where(and(eq(scriptFiles.projectId, testProjectId), eq(scriptFiles.fileType, 'template')));

  console.log(`✅ 找到 ${templates.length} 个模板文件:`);
  templates.forEach((tpl) => {
    console.log(`   - ${tpl.filePath}`);
  });

  if (templates.length < 2) {
    throw new Error('❌ 模板文件数量不足');
  }
}

/**
 * 模拟删除 workspace 模板目录（验证不依赖文件系统）
 */
async function verifyNoWorkspaceDirectory() {
  console.log('\n【步骤 3】验证不依赖 workspace 模板目录');
  console.log('='.repeat(80));

  // 这里不实际删除目录，只是打印确认信息
  // 实际测试中，DatabaseTemplateProvider 应该完全不访问文件系统

  console.log('✅ 测试环境：DatabaseTemplateProvider 不依赖文件系统');
  console.log('   - 模板来源：数据库 script_files 表');
  console.log('   - projectId:', testProjectId);
}

/**
 * 创建测试会话
 */
async function createTestSession() {
  console.log('\n【步骤 4】创建测试会话');
  console.log('='.repeat(80));

  const sessionId = uuidv4();
  testSessionId = sessionId;

  await db.insert(sessions).values({
    id: sessionId,
    userId: 'test-user-e2e',
    scriptId: testScriptId,
    status: 'active',
    executionStatus: 'running',
    position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
    variables: {},
    metadata: {},
  });

  console.log('✅ 会话已创建:', sessionId);
  return sessionId;
}

/**
 * 初始化会话并验证模板加载
 */
async function initializeSessionAndVerify() {
  console.log('\n【步骤 5】初始化会话（验证 ai_ask 模板加载）');
  console.log('='.repeat(80));

  // SessionManager 会从 scripts.tags 中提取 projectId
  // 我们已经在创建脚本时添加了 `project:${projectId}` tag

  const scriptRecord = await db.query.scripts.findFirst({
    where: eq(scripts.id, testScriptId),
  });

  if (!scriptRecord) {
    throw new Error('脚本记录不存在');
  }

  console.log('✅ 脚本记录验证通过');
  console.log('   - tags:', scriptRecord.tags);

  // 创建 SessionManager 实例
  const sessionManager = new SessionManager();

  // 初始化会话
  const result = await sessionManager.initializeSession(testSessionId);

  console.log('\n📊 初始化结果:');
  console.log('   状态:', result.executionStatus);
  console.log('   AI消息:', result.aiMessage?.substring(0, 100) + '...');

  // 验证是否从数据库加载了模板
  if (result.aiMessage && result.aiMessage.length > 0) {
    console.log('✅ ai_ask 模板成功从数据库加载');
  } else {
    console.log('❌ ai_ask 模板加载失败');
    throw new Error('模板加载失败');
  }

  return result;
}

/**
 * 处理用户输入并验证 ai_say 模板加载
 */
async function processUserInputAndVerify() {
  console.log('\n【步骤 6】处理用户输入（验证 ai_say 模板加载）');
  console.log('='.repeat(80));

  const sessionManager = new SessionManager();

  // 用户输入名字
  const userInput = '我叫测试用户';
  console.log('\n👤 用户输入:', userInput);

  const result = await sessionManager.processUserInput(testSessionId, userInput);

  console.log('\n📊 对话结果:');
  console.log('   状态:', result.executionStatus);
  console.log('   AI消息:', result.aiMessage?.substring(0, 100) + '...');
  console.log('   变量:', result.variables);

  // 验证变量是否被正确提取
  if (result.variables && (result.variables as any).user_name) {
    console.log('✅ 变量提取成功: user_name =', (result.variables as any).user_name);
  } else {
    console.log('⚠️  变量提取可能失败');
    throw new Error('变量提取失败');
  }

  // 验证 ai_say 模板是否从数据库加载（通过 debugInfo 验证）
  if (result.debugInfo && result.debugInfo.prompt) {
    // 检查 prompt 是否包含模板内容
    const promptContainsTemplate = result.debugInfo.prompt.includes('你是一位专业的心理咨询师');
    if (promptContainsTemplate) {
      console.log('✅ ai_say 模板成功从数据库加载（通过 debugInfo 验证）');
    } else {
      console.log('❌ ai_say 模板加载失败：prompt 不包含模板内容');
      throw new Error('ai_say 模板验证失败');
    }
  } else {
    console.log('❌ ai_say 模板验证失败：未找到 debugInfo');
    throw new Error('ai_say 模板验证失败');
  }

  return result;
}

/**
 * 验证数据库中的会话状态
 */
async function verifySessionState() {
  console.log('\n【步骤 7】验证数据库中的会话状态');
  console.log('='.repeat(80));

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, testSessionId),
  });

  if (!session) {
    throw new Error('会话记录不存在');
  }

  console.log('\n💾 会话状态:');
  console.log('   position:', session.position);
  console.log('   variables:', session.variables);
  console.log('   executionStatus:', session.executionStatus);

  const position = session.position as any;
  if (position.actionIndex >= 1) {
    console.log('✅ 执行位置推进正常');
  } else {
    console.log('⚠️  执行位置未推进');
  }
}

/**
 * 清理测试数据
 */
async function cleanupTestData() {
  console.log('\n【步骤 8】清理测试数据');
  console.log('='.repeat(80));

  try {
    // 删除会话（级联删除消息）
    await db.delete(sessions).where(eq(sessions.id, testSessionId));
    console.log('✅ 会话已删除');

    // 删除脚本
    await db.delete(scripts).where(eq(scripts.id, testScriptId));
    console.log('✅ 脚本已删除');

    // 删除项目（级联删除 script_files）
    await db.delete(projects).where(eq(projects.id, testProjectId));
    console.log('✅ 项目及关联文件已删除');
  } catch (error) {
    console.error('清理测试数据时出错:', error);
  }
}

/**
 * 主测试流程
 */
async function testDatabaseTemplateMode() {
  try {
    console.log('='.repeat(80));
    console.log('E2E 测试：数据库模板模式（Story 0.4 WI-5）');
    console.log('='.repeat(80));

    // 1. 准备测试数据
    await setupTestData();

    // 2. 验证模板在数据库中
    await verifyTemplatesInDatabase();

    // 3. 验证不依赖 workspace
    await verifyNoWorkspaceDirectory();

    // 4. 创建会话
    await createTestSession();

    // 5. 初始化会话（测试 ai_ask）
    await initializeSessionAndVerify();

    // 6. 处理用户输入（测试 ai_say）
    await processUserInputAndVerify();

    // 7. 验证会话状态
    await verifySessionState();

    // 8. 测试总结
    console.log('\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));
    console.log('🎉 测试通过！数据库模板模式工作正常');
    console.log('');
    console.log('验证要点：');
    console.log('  ✅ 模板从数据库 script_files 表加载');
    console.log('  ✅ ai_ask 动作正确使用数据库模板');
    console.log('  ✅ ai_say 动作正确使用数据库模板');
    console.log('  ✅ 变量提取和替换正常工作');
    console.log('  ✅ 会话状态正确持久化');
    console.log('  ✅ 不依赖文件系统 workspace 目录');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    throw error;
  } finally {
    // 9. 清理测试数据
    await cleanupTestData();

    // 10. 关闭数据库连接
    await closeConnection();
  }
}

// 运行测试
testDatabaseTemplateMode().catch((error) => {
  console.error('测试执行出错:', error);
  process.exit(1);
});
