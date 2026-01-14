/**
 * 修复 action_1 的配置，添加 require_acknowledgment: true
 */

import { db } from './src/db/index.js';
import { scripts } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import yaml from 'yaml';

async function main() {
  try {
    // 获取脚本
    const script = await db.query.scripts.findFirst({
      where: eq(scripts.scriptName, 'new-session111.yaml'),
    });

    if (!script) {
      console.log('❌ Script not found');
      return;
    }

    console.log('✅ Script found, fixing action_1 config...');

    // 解析 YAML
    const parsed = yaml.parse(script.scriptContent);
    
    // 修改 action_1 的配置
    const action1 = parsed.session.phases[0].topics[0].actions[0];
    console.log('Before:', action1.config);
    
    if (!action1.config.require_acknowledgment) {
      action1.config.require_acknowledgment = true;
      action1.config.max_rounds = 1;
      console.log('After:', action1.config);
      
      // 转回 YAML
      const updatedYaml = yaml.stringify(parsed);
      
      // 更新数据库
      await db.update(scripts)
        .set({
          scriptContent: updatedYaml,
          updatedAt: new Date(),
        })
        .where(eq(scripts.id, script.id));
      
      console.log('✅ Script updated successfully!');
      console.log('\n==== Updated YAML ====\n');
      console.log(updatedYaml);
    } else {
      console.log('⚠️ Script already has require_acknowledgment set');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
