import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query, queryNearbyDrivers } from '../db';
import { recordSpatialQueryLatency } from '../telemetry/ingestion';

export const driverRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/drivers - List all drivers
  fastify.get('/drivers', async () => {
    const res = await query(`
      SELECT
        id,
        name,
        phone,
        vehicle_type AS "vehicleType",
        license_plate AS "licensePlate",
        rating,
        status,
        ST_Y(current_location) AS latitude,
        ST_X(current_location) AS longitude,
        heading,
        speed,
        battery_level AS "batteryLevel",
        last_heartbeat AS "lastHeartbeat"
      FROM drivers
      ORDER BY name ASC;
    `);

    return {
      drivers: res.rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        vehicleType: r.vehicleType,
        licensePlate: r.licensePlate,
        rating: parseFloat(r.rating),
        status: r.status,
        heading: parseFloat(r.heading || '0'),
        speed: parseFloat(r.speed || '0'),
        batteryLevel: parseFloat(r.batteryLevel || '100'),
        currentLocation: r.latitude
          ? {
              latitude: parseFloat(r.latitude),
              longitude: parseFloat(r.longitude),
            }
          : null,
        lastHeartbeat: r.lastHeartbeat,
      })),
      count: res.rowCount,
    };
  });

  // GET /api/drivers/nearby - Spatial radius query using PostGIS ST_DWithin
  fastify.get<{
    Querystring: { lat: string; lng: string; radius?: string; idleOnly?: string };
  }>('/drivers/nearby', async (req, reply) => {
    const { lat, lng, radius, idleOnly } = req.query;

    if (!lat || !lng) {
      return reply.status(400).send({ error: 'lat and lng query parameters are required' });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);
    const radiusMeters = radius ? parseInt(radius, 10) : 5000;
    const filterIdle = idleOnly !== 'false';

    const result = await queryNearbyDrivers(latitude, longitude, radiusMeters, 20, filterIdle);
    recordSpatialQueryLatency(result.durationMs);

    return {
      drivers: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        vehicleType: row.vehicleType,
        rating: parseFloat(row.rating),
        status: row.status,
        batteryLevel: parseFloat(row.batteryLevel || '100'),
        distanceMeters: parseFloat(row.distance_meters),
        currentLocation: {
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
        },
      })),
      queryDurationMs: result.durationMs,
      radiusMeters,
      count: result.rowCount,
    };
  });

  // PATCH /api/drivers/:id/status - Update driver status
  fastify.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/drivers/:id/status',
    async (req, reply) => {
      const { id } = req.params;
      const { status } = req.body;

      await query(
        `UPDATE drivers SET status = $2, last_heartbeat = NOW(), updated_at = NOW() WHERE id = $1`,
        [id, status]
      );

      return reply.send({ success: true, driverId: id, status });
    }
  );
};
