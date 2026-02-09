import { db } from './src/db/index.js';
import { sessions, scriptFiles, projects } from './src/db/schema.js';
import { eq, desc, and } from 'drizzle-orm';

async function findActiveProjectSessions() {
  console.log('🔍 查找所有活动会话及其项目绑定\n');
  
  // 获取所有活动会话
  const activeSessions = await db.select()
    .from(sessions)
    .where(eq(sessions.status, 'active'))
    .orderBy(desc(sessions.createdAt))
    .limit(10);
  
  console.log(`找到 ${activeSessions.length} 个活动会话:\n`);
  
  for (const session of activeSessions) {
    console.log(`📋 Session: ${session.id.substring(0, 8)}...`);
    console.log(`   Script ID: ${session.scriptId}`);
    console.log(`   Created: ${session.createdAt}`);
    
    // 查找脚本
    const [script] = await db.select()
      .from(scriptFiles)
      .where(eq(scriptFiles.id, session.scriptId));
    
    if (script) {
      console.log(`   ✅ Script: ${script.fileName}`);
      console.log(`   Project ID: ${script.projectId}`);
      
      // 查找项目
      const [project] = await db.select()
        .from(projects)
        .where(eq(projects.id, script.projectId));
      
      if (project) {
        console.log(`   📁 Project: ${project.projectName}`);
      }
    } else {
      console.log(`   ❌ Script not found (已删除)`);
    }
    
    console.log('');
  }
  
  // 查找 test999 项目
  console.log('\n📁 查找 test999 项目:\n');
  const allProjects = await db.select().from(projects);
  const test999Projects = allProjects.filter(p => 
    p.projectName?.toLowerCase().includes('test999') || 
    p.projectName?.toLowerCase().includes('999')
  );
  
  for (const project of test999Projects) {
    console.log(`   ${project.projectName}`);
    console.log(`   ID: ${project.id}`);
    
    // 查找该项目的脚本
    const scripts = await db.select()
      .from(scriptFiles)
      .where(and(
        eq(scriptFiles.projectId, project.id),
        eq(scriptFiles.fileType, 'session')
      ));
    
    console.log(`   Session 脚本数: ${scripts.length}`);
    for (const s of scripts) {
      console.log(`      - ${s.fileName} (ID: ${s.id.substring(0, 8)}...)`);
    }
    console.log('');
  }
  
  console.log('\n💡 建议:');
  console.log('   1. 在前端切换到 test999 项目');
  console.log('   2. 使用 test999 项目中的脚本创建新会话');
  console.log('   3. 新会话将自动使用 test999 项目的模板');
  
  process.exit(0);
}

findActiveProjectSessions().catch(console.error);
