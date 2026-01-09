import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, closeConnection } from './index.js';

/**
 * 运行数据库迁移
 */
async function runMigrations() {
  console.log('⏳ Running database migrations...');

  try {
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closeConnection();
  }
}

runMigrations();
