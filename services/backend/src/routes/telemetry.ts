import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { TelemetryPing, TelemetryBatchPayload } from '@fleetrelay/contracts';
import { ingestTelemetryPing, ingestTelemetryBatch } from '../telemetry/ingestion';
import { query } from '../db';

export const telemetryRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // POST /api/telemetry/ping - Ingest single coordinate ping
  fastify.post<{ Body: TelemetryPing }>('/telemetry/ping', async (req, reply) => {
    const ping = req.body;
    if (!ping.driverId || !ping.coords?.latitude || !ping.coords?.longitude) {
      return reply.status(400).send({ error: 'driverId, latitude, and longitude are required' });
    }

    await ingestTelemetryPing(ping);
    return reply.status(202).send({ success: true, receivedAt: new Date().toISOString() });
  });

  // POST /api/telemetry/batch - Ingest batch of coordinate pings from mobile client
  fastify.post<{ Body: TelemetryBatchPayload }>('/telemetry/batch', async (req, reply) => {
    const payload = req.body;
    if (!payload.driverId || !Array.isArray(payload.pings)) {
      return reply.status(400).send({ error: 'driverId and pings array are required' });
    }

    const count = await ingestTelemetryBatch(payload);
    return reply.status(202).send({ success: true, processedCount: count });
  });

  // GET /api/telemetry/history/:driverId - Retrieve recent GPS trajectory
  fastify.get<{ Params: { driverId: string }; Querystring: { limit?: string } }>(
    '/telemetry/history/:driverId',
    async (req, reply) => {
      const { driverId } = req.params;
      const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;

      const res = await query(
        `
        SELECT
          id,
          ST_Y(location) AS latitude,
          ST_X(location) AS longitude,
          speed,
          heading,
          accuracy,
          battery_level AS "batteryLevel",
          created_at AS "createdAt"
        FROM driver_telemetry_history
        WHERE driver_id = $1
        ORDER BY created_at DESC
        LIMIT $2;
        `,
        [driverId, limit]
      );

      return {
        driverId,
        count: res.rowCount,
        trail: res.rows.map((r) => ({
          latitude: parseFloat(r.latitude),
          longitude: parseFloat(r.longitude),
          speed: parseFloat(r.speed),
          heading: parseFloat(r.heading),
          accuracy: r.accuracy ? parseFloat(r.accuracy) : null,
          batteryLevel: parseFloat(r.batteryLevel),
          createdAt: r.createdAt,
        })),
      };
    }
  );
};
