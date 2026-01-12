/**
 * 查询数据库中的工程和文件
 */
import { db, closeConnection } from './src/db/index.js';
import { projects, scriptFiles } from './src/db/schema.js';

async function checkDatabase() {
  try {
    console.log('📊 查询数据库数据...\n');

    // 查询工程
    const allProjects = await db.select().from(projects);
    console.log(`✅ 找到 ${allProjects.length} 个工程：`);
    for (const project of allProjects) {
      console.log(`   - ${project.projectName} (ID: ${project.id})`);
      console.log(`     描述: ${project.description}`);
      console.log(`     引擎版本: ${project.engineVersion}`);
      console.log(`     标签: ${project.tags.join(', ')}`);
      console.log(`     状态: ${project.status}`);
      console.log('');
    }

    // 查询文件
    const allFiles = await db.select().from(scriptFiles);
    console.log(`✅ 找到 ${allFiles.length} 个脚本文件：`);
    for (const file of allFiles) {
      console.log(`   - ${file.fileName} (${file.fileType})`);
      console.log(`     所属工程ID: ${file.projectId}`);
      console.log('');
    }

  } catch (error) {
    console.error('❌ 查询失败:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

checkDatabase();
