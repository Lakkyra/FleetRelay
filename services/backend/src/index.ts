import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config';
import { pool } from './db';
import { initRedis, redis } from './redis';
import { telemetryBatchWorker } from './telemetry/batchWriter';
import { registerWebSocketGateway } from './websocket/gateway';
import { jobRoutes } from './routes/jobs';
import { driverRoutes } from './routes/drivers';
import { telemetryRoutes } from './routes/telemetry';
import { metricRoutes } from './routes/metrics';

async function bootstrap() {
  const fastify = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
  });

  // Enable CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register WebSockets
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Register WebSocket Gateway
  registerWebSocketGateway(fastify);

  // Register REST API Routes under /api prefix
  await fastify.register(jobRoutes, { prefix: '/api' });
  await fastify.register(driverRoutes, { prefix: '/api' });
  await fastify.register(telemetryRoutes, { prefix: '/api' });
  await fastify.register(metricRoutes, { prefix: '/api' });

  // Root healthcheck
  fastify.get('/health', async () => {
    return { status: 'healthy', timestamp: new Date().toISOString() };
  });

  // Start Server and Infrastructure
  try {
    // 1. Connect Redis
    await initRedis();

    // 2. Test PostgreSQL / PostGIS connection
    const dbCheck = await pool.query('SELECT PostGIS_Version();');
    console.log(`[PostGIS] Connected! PostGIS Version: ${dbCheck.rows[0].postgis_version}`);

    // 3. Start Telemetry Batch Consumer Worker
    telemetryBatchWorker.start();

    // 4. Listen on configured port
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`\n======================================================`);
    console.log(`🚀 FleetRelay Dispatch Engine listening on ${config.host}:${config.port}`);
    console.log(`📡 WebSocket Gateway: ws://${config.host}:${config.port}/ws`);
    console.log(`🗺️ REST API Endpoints: http://${config.host}:${config.port}/api`);
    console.log(`======================================================\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Shutdown] Received ${signal}. Draining connections...`);
    try {
      telemetryBatchWorker.stop();
      await telemetryBatchWorker.flush();
      await fastify.close();
      await pool.end();
      await redis.quit();
      console.log('[Shutdown] Completed cleanly.');
      process.exit(0);
    } catch (err) {
      console.error('[Shutdown Error]:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap();
