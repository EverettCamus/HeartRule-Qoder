import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { config } from 'dotenv';
import Fastify from 'fastify';

// ES module 中获取 __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 加载环境变量
config({ path: resolve(__dirname, '../../../.env') });

/**
 * 创建Fastify应用实例
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      // 减少HTTP请求日志的内容大小
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    },
  });

  // 注册CORS插件
  await app.register(cors, {
    origin: '*', // 开发环境允许所有来源，生产环境需要配置白名单
    credentials: true,
  });

  // 注册Swagger文档插件
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'HeartRule AI咨询引擎 API',
        description: '基于LLM和YAML脚本的认知行为疗法AI咨询系统',
        version: '2.0.0',
      },
      servers: [
        {
          url: 'http://localhost:8000',
          description: '开发服务器',
        },
      ],
      tags: [
        { name: 'sessions', description: '会话管理' },
        { name: 'chat', description: '聊天交互' },
        { name: 'scripts', description: '脚本管理' },
      ],
    },
  });

  // 注册Swagger UI插件
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // 注册WebSocket插件
  await app.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // 根路径
  app.get('/', async () => {
    return {
      message: 'HeartRule AI咨询引擎 API',
      version: '2.0.0',
      docs: '/docs',
      health: '/health',
    };
  });

  // 健康检查
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  // 注册路由
  const { registerSessionRoutes } = await import('./routes/sessions.js');
  const { registerChatRoutes } = await import('./routes/chat.js');
  const { registerScriptRoutes } = await import('./routes/scripts.js');
  const projectsRoutes = (await import('./routes/projects.js')).default;
  const versionsRoutes = (await import('./routes/versions.js')).default;

  await registerSessionRoutes(app);
  await registerChatRoutes(app);
  await registerScriptRoutes(app);
  await app.register(projectsRoutes, { prefix: '/api' });
  await app.register(versionsRoutes, { prefix: '/api' });

  return app;
}

/**
 * 启动服务器
 */
export async function startServer() {
  const app = await buildApp();

  const port = parseInt(process.env.API_PORT || '8000', 10);
  const host = process.env.API_HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    console.log(`🚀 Server running at http://${host}:${port}`);
    console.log(`📚 API Documentation: http://${host}:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // 优雅关闭
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      console.log(`\n${signal} received, closing server...`);
      await app.close();
      process.exit(0);
    });
  });
}
