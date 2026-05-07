/**
 * 测试全局变量加载和替换功能
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';
import yaml from 'yaml';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { db } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';

async function main() {
  try {
    console.log('='.repeat(80));
    console.log('测试全局变量加载和替换功能');
    console.log('='.repeat(80));

    // 1. 查找 "CBT Depression Assessment Project" 项目
    console.log('\n📋 步骤 1: 查找项目');
    const project = await db.query.projects.findFirst({
      where: eq(projects.projectName, 'CBT Depression Assessment Project'),
    });

    if (!project) {
      console.error('❌ 未找到项目: CBT Depression Assessment Project');
      console.log('请先运行脚本编辑器创建该项目');
      return;
    }

    console.log('✅ 找到项目:', {
      id: project.id,
      name: project.projectName,
    });

    // 2. 检查 global.yaml 文件
    console.log('\n📋 步骤 2: 检查 global.yaml 文件');
    const globalFile = await db.query.scriptFiles.findFirst({
      where: (fields, { and, eq }) =>
        and(eq(fields.projectId, project.id), eq(fields.fileType, 'global')),
    });

    if (!globalFile) {
      console.error('❌ 未找到 global.yaml 文件');
      console.log('项目应该在创建时自动创建此文件');
      return;
    }

    console.log('✅ 找到 global.yaml 文件:', {
      id: globalFile.id,
      fileName: globalFile.fileName,
      hasYamlContent: !!globalFile.yamlContent,
      hasFileContent: !!globalFile.fileContent,
    });

    // 3. 检查当前内容
    console.log('\n📋 步骤 3: 检查当前全局变量');
    let currentVariables: any[] = [];
    
    if (globalFile.yamlContent) {
      const parsed = yaml.parse(globalFile.yamlContent);
      currentVariables = parsed?.variables || [];
    } else if (globalFile.fileContent) {
      currentVariables = (globalFile.fileContent as any)?.variables || [];
    }

    console.log('当前全局变量:', currentVariables);

    // 4. 更新 global.yaml，添加测试变量
    console.log('\n📋 步骤 4: 更新全局变量');
    const newVariables = [
      { name: '咨询师名', value: '华小光' },
      { name: '用户名', value: '来访者' },
    ];

    const globalYaml = yaml.stringify({ variables: newVariables });
    
    await db
      .update(scriptFiles)
      .set({
        yamlContent: globalYaml,
        fileContent: { variables: newVariables },
        updatedAt: new Date(),
      })
      .where(eq(scriptFiles.id, globalFile.id));

    console.log('✅ 全局变量已更新:');
    console.log(globalYaml);

    // 5. 验证更新
    console.log('\n📋 步骤 5: 验证更新');
    const updatedFile = await db.query.scriptFiles.findFirst({
      where: eq(scriptFiles.id, globalFile.id),
    });

    if (!updatedFile) {
      console.error('❌ 无法读取更新后的文件');
      return;
    }

    const verifyParsed = yaml.parse(updatedFile.yamlContent || '');
    console.log('✅ 验证成功，全局变量已保存:', verifyParsed.variables);

    // 6. 提示下一步
    console.log('\n' + '='.repeat(80));
    console.log('✅ 全局变量配置完成！');
    console.log('\n下一步操作:');
    console.log('1. 在编辑器中确认 global.yaml 已更新');
    console.log('2. 创建或重新开始一个使用该脚本的会话');
    console.log('3. 检查变量 "咨询师名" 是否被正确替换为 "华小光"');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ 错误:', error);
  } finally {
    process.exit(0);
  }
}

main();
