import { startServer } from './app.js';

/**
 * 应用入口
 */
startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
