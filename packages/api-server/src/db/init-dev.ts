/**
 * 开发环境快速初始化脚本
 * 跳过数据库，使用内存模拟数据用于演示
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 模拟的内存数据存储
export const memoryDB = {
  scripts: new Map<string, any>(),
  sessions: new Map<string, any>(),
  messages: new Map<string, any[]>(),
};

/**
 * 初始化开发数据
 */
export function initDevData() {
  console.log('🔧 Initializing development data...');
  
  // 加载 CBT 脚本
  try {
    const scriptPath = resolve(__dirname, '../../../../scripts/sessions/cbt_depression_assessment.yaml');
    const scriptContent = readFileSync(scriptPath, 'utf-8');
    
    const script = {
      id: 'cbt_depression_001',
      scriptName: 'CBT抑郁症初次评估会谈',
      scriptType: 'session',
      scriptContent: scriptContent,
      version: '1.0.0',
      status: 'published',
      author: 'HeartRule Team',
      description: '用于抑郁症患者的初次评估会谈',
      tags: ['CBT', '抑郁症', '评估'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    memoryDB.scripts.set(script.id, script);
    console.log(`✅ Loaded script: ${script.scriptName}`);
  } catch (error) {
    console.error('❌ Failed to load script:', error);
  }
  
  console.log('✅ Development data initialized');
}

// 自动初始化
initDevData();
