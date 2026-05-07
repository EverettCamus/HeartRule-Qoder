/**
 * 重置数据库 - 删除所有数据并重新导入
 */
import { db, closeConnection } from './src/db/index.js';
import { 
  projects, 
  scriptFiles, 
  projectVersions, 
  projectDrafts,
  sessions,
  messages,
  variables,
  memories,
  scripts
} from './src/db/schema.js';

async function resetDatabase() {
  try {
    console.log('🗑️  开始清理数据库...');

    // 按照外键依赖顺序删除数据
    console.log('  删除 memories...');
    await db.delete(memories);
    
    console.log('  删除 variables...');
    await db.delete(variables);
    
    console.log('  删除 messages...');
    await db.delete(messages);
    
    console.log('  删除 sessions...');
    await db.delete(sessions);
    
    console.log('  删除 scripts...');
    await db.delete(scripts);
    
    console.log('  删除 project_versions...');
    await db.delete(projectVersions);
    
    console.log('  删除 project_drafts...');
    await db.delete(projectDrafts);
    
    console.log('  删除 script_files...');
    await db.delete(scriptFiles);
    
    console.log('  删除 projects...');
    await db.delete(projects);

    console.log('✅ 数据库清理完成\n');

    console.log('📦 现在可以运行以下命令重新导入数据：');
    console.log('   pnpm run db:migrate     # 确保schema同步');
    console.log('   tsx create-sample-project.mjs  # 创建示例工程');
    
  } catch (error) {
    console.error('❌ 重置数据库失败:', error);
    throw error;
  } finally {
    await closeConnection();
  }
}

resetDatabase();
