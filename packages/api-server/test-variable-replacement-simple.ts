/**
 * 简化测试：验证变量替换功能
 * 使用不触发模板模式的配置
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { projects, scriptFiles, scripts, sessions } from './src/db/schema.js';
import { SessionManager } from './src/services/session-manager.js';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('简化测试：验证变量替换功能');
    console.log('='.repeat(80));

    // 1. 创建测试脚本（使用简单的 ai_say，不触发模板模式）
    console.log('\n📋 步骤 1: 创建测试脚本');
    
    const testScriptYaml = `
metadata:
  name: 变量替换测试脚本
  version: '1.0'
  author: Test
  description: 测试全局变量替换功能

session:
  session_id: test_variable_replacement
  session_name: 变量替换测试
  phases:
    - phase_id: phase_1
      phase_name: 测试阶段
      topics:
        - topic_id: topic_1
          topic_name: 测试话题
          actions:
            - action_id: action_1
              action_type: ai_say
              config:
                content_template: |
                  你好，我是\${咨询师名}，很高兴认识你。
                  如果你有任何问题，随时可以告诉我。
                require_acknowledgment: false
`.trim();

    // 2. 插入脚本到数据库
    const scriptName = `test_variable_replacement_${Date.now()}.yaml`;
    
    const [newScript] = await db.insert(scripts).values({
      scriptName: scriptName,
      scriptType: 'session',
      scriptContent: testScriptYaml,
      version: '1.0',
      status: 'draft',
      author: 'test',
      description: '变量替换测试脚本',
    }).returning();

    console.log('✅ 测试脚本已创建:', scriptName);

    // 3. 创建一个临时项目和脚本文件（用于关联 global.yaml）
    const project = await db.query.projects.findFirst({
      where: eq(projects.projectName, 'CBT Depression Assessment Project'),
    });

    if (!project) {
      console.error('❌ 未找到项目，请先创建 CBT Depression Assessment Project');
      return;
    }

    // 将脚本文件添加到项目中
    await db.insert(scriptFiles).values({
      projectId: project.id,
      fileType: 'session',
      fileName: scriptName,
      fileContent: yaml.parse(testScriptYaml),
      yamlContent: testScriptYaml,
    });

    console.log('✅ 脚本文件已添加到项目中');

    // 4. 创建测试会话
    console.log('\n📋 步骤 2: 创建测试会话');
    const sessionId = uuidv4();
    const userId = 'test-user';

    await db.insert(sessions).values({
      id: sessionId,
      userId,
      scriptId: newScript.id,
      status: 'active',
      executionStatus: 'running',
      position: { phaseIndex: 0, topicIndex: 0, actionIndex: 0 },
      variables: {},
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✅ 测试会话已创建');

    // 5. 初始化会话
    console.log('\n📋 步骤 3: 初始化会话并验证变量替换');
    const sessionManager = new SessionManager();
    const initResult = await sessionManager.initializeSession(sessionId);

    console.log('\n' + '='.repeat(80));
    console.log('测试结果:');
    console.log('='.repeat(80));

    // 验证变量
    console.log('\n✅ 加载的全局变量:');
    console.log(JSON.stringify(initResult.variables, null, 2));

    // 验证 AI 消息
    if (initResult.aiMessage) {
      console.log('\n✅ AI 消息内容:');
      console.log('-'.repeat(80));
      console.log(initResult.aiMessage);
      console.log('-'.repeat(80));

      // 检查变量是否被替换
      const 咨询师名 = initResult.variables?.['咨询师名'] as string;
      if (咨询师名 && initResult.aiMessage.includes(咨询师名)) {
        console.log(`\n✅ 成功！变量 "咨询师名" 已被替换为 "${咨询师名}"`);
      } else {
        console.log(`\n❌ 失败！AI 消息中未找到变量值 "${咨询师名}"`);
      }

      // 检查是否还包含模板语法
      if (initResult.aiMessage.includes('${') || initResult.aiMessage.includes('{{')) {
        console.log('⚠️ 警告：AI 消息中仍包含模板语法，可能未完全替换');
      }
    } else {
      console.log('\n❌ 未生成 AI 消息');
    }

    // 清理
    console.log('\n🧹 清理测试数据...');
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    await db.delete(scriptFiles).where(eq(scriptFiles.fileName, scriptName));
    await db.delete(scripts).where(eq(scripts.id, newScript.id));
    console.log('✅ 清理完成');

    console.log('\n' + '='.repeat(80));
    console.log('✅ 测试完成！');
    console.log('='.repeat(80));

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
