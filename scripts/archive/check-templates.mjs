import { db } from './dist/db/index.js';
import { scriptFiles } from './dist/db/schema.js';
import { eq } from 'drizzle-orm';

(async () => {
  try {
    const templates = await db.select().from(scriptFiles).where(eq(scriptFiles.fileType, 'template'));
    
    console.log('\n模板文件列表 (' + templates.length + ' 个):');
    console.log('='.repeat(60));
    
    templates.forEach(t => {
      console.log(`项目: ${t.projectId}`);
      console.log(`路径: ${t.filePath}`);
      console.log('-'.repeat(60));
    });
    
    process.exit(0);
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
})();
