#!/usr/bin/env ts-node
/**
 * 导入 AI-Ask 退出决策测试项目到数据库
 * 用法：pnpm tsx scripts/db/import-ai-ask-exit-project.ts
 *
 * 该脚本将创建：
 * 1. 一个名为 "smart-ai-ask-exit" 的项目
 * 2. 5个测试场景的脚本文件
 * 3. 提示词模板文件（ai_ask_v1, ai_say_v1 等）
 */

import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../../packages/api-server/src/db/index';
import { projects, scriptFiles } from '../../packages/api-server/src/db/schema';
import { eq } from 'drizzle-orm';
import yaml from 'js-yaml';

// 项目配置
const PROJECT_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROJECT_NAME = 'smart-ai-ask-exit';

// 场景配置
const SCENARIOS = [
  {
    id: '660e8400-e29b-41d4-a716-446655440001',
    name: 'scenario-1-normal-exit.yaml',
    path: '_system/test-scenarios/scenario-1-normal-exit.yaml',
    title: '场景1：正常退出 - 信息完整',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440002',
    name: 'scenario-2-impedance-exit.yaml',
    path: '_system/test-scenarios/scenario-2-impedance-exit.yaml',
    title: '场景2：阻抗退出 - 用户回避',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440003',
    name: 'scenario-3-topic-drift.yaml',
    path: '_system/test-scenarios/scenario-3-topic-drift.yaml',
    title: '场景3：偏题退出 - 用户离题',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440004',
    name: 'scenario-4-max-rounds-safety.yaml',
    path: '_system/test-scenarios/scenario-4-max-rounds-safety.yaml',
    title: '场景4：最大轮次退出 - 安全网触发',
  },
  {
    id: '660e8400-e29b-41d4-a716-446655440005',
    name: 'scenario-5-comprehensive.yaml',
    path: '_system/test-scenarios/scenario-5-comprehensive.yaml',
    title: '场景5：综合条件退出 - 混合评估',
  },
];

async function importAiAskExitProject() {
  try {
    console.log('🚀 开始导入 AI-Ask 退出决策测试项目...\n');

    // 第一步：创建项目
    console.log('📦 第一步：创建项目 "smart-ai-ask-exit"');

    // 检查项目是否已存在
    const existingProject = await db
      .select()
      .from(projects)
      .where(eq(projects.projectName, PROJECT_NAME))
      .limit(1);

    if (existingProject.length > 0) {
      console.log(`⚠️  项目 "${PROJECT_NAME}" 已存在，跳过创建`);
    } else {
      await db.insert(projects).values({
        id: PROJECT_ID as any,
        projectName: PROJECT_NAME,
        description:
          'AI-Ask 退出决策机制测试项目 (v1.2) - 测试5个核心退出场景：正常退出、阻抗退出、偏题退出、最大轮次安全网、综合条件退出',
        engineVersion: '1.0',
        engineVersionMin: '0.9',
        currentVersionId: null,
        status: 'published',
        author: 'Test Suite',
        tags: ['exit-decision', 'ai-ask', 'test-scenarios', '2026-03-20'] as any,
        metadata: {
          created_by: 'ai-ask-exit-testing',
          test_framework: 'comprehensive',
          design_doc: 'docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md',
          scenarios: 5,
          focus_areas: [
            'required_variables',
            'impedance_threshold',
            'topic_drift_threshold',
            'max_rounds',
            'crisis_detected',
          ],
        } as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`✅ 项目创建成功 (ID: ${PROJECT_ID})\n`);
    }

    // 第二步：为每个场景创建脚本文件
    console.log('📝 第二步：为每个场景创建脚本文件');

    const scenariosDir = path.join(process.cwd(), 'scripts/sessions/exit-tests');

    for (const scenario of SCENARIOS) {
      const yamlPath = path.join(scenariosDir, scenario.name);

      if (!fs.existsSync(yamlPath)) {
        console.log(`❌ 文件不存在：${yamlPath}`);
        continue;
      }

      const yamlContent = fs.readFileSync(yamlPath, 'utf8');

      // 检查脚本是否已存在
      const existingFile = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.filePath, scenario.path))
        .limit(1);

      if (existingFile.length > 0) {
        console.log(`⚠️  脚本已存在：${scenario.name}，跳过创建`);
        continue;
      }

      await db.insert(scriptFiles).values({
        id: scenario.id as any,
        projectId: PROJECT_ID as any,
        fileType: 'session',
        fileName: scenario.name,
        filePath: scenario.path,
        fileContent: {} as any,
        yamlContent: yamlContent,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`✅ ${scenario.title}`);
    }

    // 第三步：复制提示词模板文件
    console.log('\n📋 第三步：复制提示词模板文件到工程');

    const templatesDir = path.join(process.cwd(), 'config/templates/default');
    const templateFiles = fs
      .readdirSync(templatesDir)
      .filter((file) => file.endsWith('.md'));

    for (const templateFile of templateFiles) {
      const templatePath = path.join(templatesDir, templateFile);
      const templateContent = fs.readFileSync(templatePath, 'utf8');

      // 文件路径格式：_system/config/default/{filename}
      const defaultFilePath = `_system/config/default/${templateFile}`;

      // 检查模板文件是否已存在
      const existingTemplate = await db
        .select()
        .from(scriptFiles)
        .where(eq(scriptFiles.filePath, defaultFilePath))
        .limit(1);

      if (existingTemplate.length > 0) {
        console.log(`⚠️  模板已存在：${templateFile}，跳过复制`);
        continue;
      }

      await db.insert(scriptFiles).values({
        id: uuidv4() as any,
        projectId: PROJECT_ID as any,
        fileType: 'template',
        fileName: templateFile,
        filePath: defaultFilePath,
        fileContent: { content: templateContent } as any,
        yamlContent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`✅ 模板文件：${templateFile}`);
    }

    console.log('\n')

    // 第四步：显示导入摘要
    console.log('📋 项目摘要：');
    console.log(`   项目名称：${PROJECT_NAME}`);
    console.log(`   项目ID：${PROJECT_ID}`);
    console.log(`   脚本数量：${SCENARIOS.length}`);
    console.log(`   模板文件：${templateFiles.length}`);
    console.log(`   设计文档：docs/superpowers/specs/2026-03-18-ai-ask-exit-decision-design.md`);

    console.log('\n🎯 测试场景列表：');
    SCENARIOS.forEach((s, idx) => {
      console.log(`   ${idx + 1}. ${s.title}`);
    });

    console.log('\n💡 下一步操作：');
    console.log('   1. 打开编辑器：pnpm dev:editor');
    console.log('   2. 打开API服务：pnpm dev');
    console.log('   3. 在编辑器中加载项目 "smart-ai-ask-exit"');
    console.log('   4. 逐个测试5个场景的退出行为');

    console.log('\n✨ 准备好进行调试了！');
  } catch (error) {
    console.error('❌ 导入失败：', error);
    process.exit(1);
  }
}

// 运行导入
importAiAskExitProject();
