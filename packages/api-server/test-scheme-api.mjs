import { db } from './dist/db/index.js';
import { scriptFiles, projects } from './dist/db/schema.js';
import { eq, and } from 'drizzle-orm';

(async () => {
  try {
    // 获取第一个有custom模板的项目
    const projectId = '4144cde4-4770-4af6-b4a7-9dc2660f57e6'; // 有test2方案
    
    console.log(`\n测试项目: ${projectId}`);
    console.log('='.repeat(60));
    
    // 查询模板文件
    const templateFiles = await db.select()
      .from(scriptFiles)
      .where(
        and(
          eq(scriptFiles.projectId, projectId),
          eq(scriptFiles.fileType, 'template')
        )
      );
    
    console.log(`\n找到 ${templateFiles.length} 个模板文件:`);
    templateFiles.forEach(t => {
      console.log(`  - ${t.filePath}`);
    });
    
    // 解析方案
    const schemeMap = new Map();
    
    for (const file of templateFiles) {
      if (!file.filePath) continue;
      const parts = file.filePath.split('/');
      if (parts.length >= 4 && parts[0] === '_system' && parts[1] === 'config') {
        const layer = parts[2];
        if (layer === 'default') {
          if (!schemeMap.has('default')) {
            schemeMap.set('default', {
              name: 'default',
              description: 'System default template scheme',
              isDefault: true,
            });
          }
        } else if (layer === 'custom' && parts.length >= 5) {
          const schemeName = parts[3];
          if (!schemeMap.has(schemeName)) {
            schemeMap.set(schemeName, {
              name: schemeName,
              description: `Custom template scheme: ${schemeName}`,
              isDefault: false,
            });
          }
        }
      }
    }
    
    const schemes = Array.from(schemeMap.values());
    
    console.log(`\n解析出 ${schemes.length} 个方案:`);
    schemes.forEach(s => {
      console.log(`  - ${s.name} (${s.isDefault ? '默认' : '自定义'}): ${s.description}`);
    });
    
    console.log('\nAPI 返回格式:');
    console.log(JSON.stringify(schemes, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('错误:', error);
    process.exit(1);
  }
})();
