import { db } from './src/db/index.js';
import { sessions } from './src/db/schema.js';
import { desc } from 'drizzle-orm';

async function findLatestSession() {
  const [latest] = await db.select()
    .from(sessions)
    .orderBy(desc(sessions.createdAt))
    .limit(1);
  
  if (latest) {
    console.log('📋 Latest Session:');
    console.log('   ID:', latest.id);
    console.log('   Script ID:', latest.scriptId);
    console.log('');
    
    const metadata = latest.metadata as any;
    console.log('🔍 Metadata:');
    console.log(JSON.stringify(metadata, null, 2));
  }
  
  process.exit(0);
}

findLatestSession().catch(console.error);
