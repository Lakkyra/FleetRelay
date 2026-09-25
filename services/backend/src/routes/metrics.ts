import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db';
import { redis } from '../redis';
import { config } from '../config';
import { telemetryMetrics } from '../telemetry/ingestion';

export const metricRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/metrics - Real-time telemetry and geospatial performance metrics
  fastify.get('/metrics', async () => {
    // 1. Database stats
    const driverStats = await query(`
      SELECT
        COUNT(*) AS total_drivers,
        COUNT(*) FILTER (WHERE status = 'idle') AS idle_drivers,
        COUNT(*) FILTER (WHERE status = 'en_route' OR status = 'on_job') AS busy_drivers,
        COUNT(*) FILTER (WHERE status = 'offline') AS offline_drivers
      FROM drivers;
    `);

    const jobStats = await query(`
      SELECT
        COUNT(*) AS total_jobs,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_jobs,
        COUNT(*) FILTER (WHERE status = 'offered') AS offered_jobs,
        COUNT(*) FILTER (WHERE status = 'accepted' OR status = 'in_transit') AS active_jobs,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_jobs
      FROM jobs;
    `);

    // 2. Redis stream pending length
    let streamLength = 0;
    try {
      streamLength = await redis.xlen(config.redis.streamName);
    } catch {
      // Stream may not have been created yet
    }

    const dRow = driverStats.rows[0];
    const jRow = jobStats.rows[0];

    return {
      status: 'operational',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      drivers: {
        total: parseInt(dRow.total_drivers, 10),
        idle: parseInt(dRow.idle_drivers, 10),
        busy: parseInt(dRow.busy_drivers, 10),
        offline: parseInt(dRow.offline_drivers, 10),
      },
      jobs: {
        total: parseInt(jRow.total_jobs, 10),
        pending: parseInt(jRow.pending_jobs, 10),
        offered: parseInt(jRow.offered_jobs, 10),
        active: parseInt(jRow.active_jobs, 10),
        completed: parseInt(jRow.completed_jobs, 10),
      },
      telemetry: {
        ingestionRatePerSec: telemetryMetrics.currentIngestionRatePerSec,
        totalCoordinatesIngested: telemetryMetrics.totalCoordinatesIngested,
        streamPendingCount: streamLength,
      },
      geospatial: {
        avgQueryLatencyMs: telemetryMetrics.avgSpatialQueryLatencyMs,
        totalQueriesExecuted: telemetryMetrics.spatialQueryCount,
        targetLatencySlaMs: 40,
      },
    };
  });
};
