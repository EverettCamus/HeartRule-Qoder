/**
 * 更新示例工程的会谈脚本，添加4个Action节点
 */

import { eq } from 'drizzle-orm';
import yaml from 'js-yaml';

import { db } from './src/db/index.js';
import { scriptFiles } from './src/db/schema.js';

// 简化版的脚本结构，包含4个Action节点示例
const sampleScript = {
  metadata: {
    name: 'CBT Depression Initial Assessment Session',
    version: '1.0',
    author: 'HeartRule Team',
    description: '用于抑郁症患者的初次评估会谈，建立关系并收集基础信息',
    target_audience: '抑郁症患者',
    estimated_duration: '20-30分钟',
  },
  session: {
    session_id: 'cbt_depression_assessment_v1',
    session_name: 'CBT Depression Initial Assessment Session',
    phases: [
      {
        phase_id: 'phase_1_rapport',
        phase_name: '建立关系阶段',
        phase_goal: '与来访者建立初步信任关系',
        topics: [
          {
            topic_id: 'topic_1_1_welcome',
            topic_name: '开场欢迎',
            topic_goal: '向来访者表示欢迎',
            actions: [
              // Action 1: ai_say - 欢迎语
              {
                action_type: 'ai_say',
                action_id: 'welcome_greeting',
                config: {
                  content_template: `你好，欢迎来到心理咨询。我是AI咨询助手，会陪伴你完成今天的会谈。
在开始之前，我想先了解一些基本信息，这将帮助我更好地理解你的情况。
你可以放心，这里的所有对话都是保密的。`,
                  say_goal: '让来访者感到被欢迎和安全',
                  require_acknowledgment: false,
                  max_rounds: 1,
                },
              },
              // Action 2: ai_ask - 询问姓名
              {
                action_type: 'ai_ask',
                action_id: 'ask_name',
                config: {
                  target_variable: 'user_name',
                  question_template: '可以告诉我你的名字吗？我可以怎么称呼你？',
                  extraction_prompt: '从用户的回复中提取用户的名字或昵称',
                  required: true,
                  max_rounds: 3,
                },
              },
            ],
          },
        ],
      },
      {
        phase_id: 'phase_2_assessment',
        phase_name: '问题评估阶段',
        phase_goal: '了解来访者的主要问题',
        topics: [
          {
            topic_id: 'topic_2_1_chief_complaint',
            topic_name: '了解主诉',
            topic_goal: '收集来访者的主要困扰',
            actions: [
              // Action 3: ai_ask - 询问主要困扰
              {
                action_type: 'ai_ask',
                action_id: 'ask_main_issue',
                config: {
                  target_variable: 'chief_complaint',
                  question_template: `\${user_name}，能和我说说是什么原因让你来到这里吗？
最近有什么困扰你的事情吗？`,
                  extraction_prompt: '提取用户描述的主要问题和困扰',
                  required: true,
                  max_rounds: 5,
                },
              },
              // Action 4: ai_think - 分析主诉
              {
                action_type: 'ai_think',
                action_id: 'analyze_complaint',
                config: {
                  think_goal: '分析主诉，初步判断症状类型',
                  input_variables: ['chief_complaint'],
                  output_variables: ['symptom_category', 'severity_level'],
                  prompt_template: `根据用户的主诉：\${chief_complaint}
请初步判断：
1. 症状类别（如：情绪问题、睡眠问题、人际关系等）
2. 严重程度（轻度/中度/重度）`,
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

async function main() {
  console.log('🔍 查询数据库中的示例工程脚本文件...');

  try {
    // 查询所有 session 类型的脚本文件
    const sessionFiles = await db
      .select()
      .from(scriptFiles)
      .where(eq(scriptFiles.fileType, 'session'));

    if (sessionFiles.length === 0) {
      console.log('⚠️  数据库中没有找到 session 类型的文件');
      console.log('💡 提示：请先创建一个示例工程');
      return;
    }

    console.log(`✅ 找到 ${sessionFiles.length} 个 session 文件`);

    // 显示找到的文件
    for (const file of sessionFiles) {
      console.log(`\n📄 文件: ${file.fileName}`);
      console.log(`   ID: ${file.id}`);
      console.log(`   项目ID: ${file.projectId}`);
      console.log(`   当前内容:`, JSON.stringify(file.fileContent).substring(0, 100) + '...');
    }

    // 更新第一个找到的文件
    const targetFile = sessionFiles[0];
    console.log(`\n🔄 准备更新文件: ${targetFile.fileName}`);

    // 生成 YAML 内容
    const yamlContent = yaml.dump(sampleScript, {
      indent: 2,
      lineWidth: 120,
      noRefs: true,
    });

    // 更新数据库
    const [updated] = await db
      .update(scriptFiles)
      .set({
        fileContent: sampleScript,
        yamlContent: yamlContent,
        updatedAt: new Date(),
      })
      .where(eq(scriptFiles.id, targetFile.id))
      .returning();

    console.log('\n✅ 更新成功！');
    console.log(`\n📝 新脚本包含：`);
    console.log(`   - 2 个 Phase（阶段）`);
    console.log(`   - 2 个 Topic（话题）`);
    console.log(`   - 4 个 Action（节点）：`);
    console.log(`     1. ai_say: 欢迎语`);
    console.log(`     2. ai_ask: 询问姓名`);
    console.log(`     3. ai_ask: 询问主要困扰`);
    console.log(`     4. ai_think: 分析主诉`);

    console.log(`\n💾 文件信息：`);
    console.log(`   - 文件名: ${updated.fileName}`);
    console.log(`   - 项目ID: ${updated.projectId}`);
    console.log(`   - 文件ID: ${updated.id}`);
  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    process.exit(0);
  }
}

main();
