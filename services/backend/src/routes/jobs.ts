import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db';
import { dispatchEngine } from '../dispatch/engine';
import { CreateJobDto } from '@fleetrelay/contracts';
import { broadcastToDispatcher } from '../websocket/gateway';

export const jobRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/jobs - List all jobs
  fastify.get('/jobs', async () => {
    const res = await query(`
      SELECT
        id,
        order_number AS "orderNumber",
        title,
        description,
        status,
        ST_Y(pickup_location) AS "pickupLat",
        ST_X(pickup_location) AS "pickupLng",
        pickup_address AS "pickupAddress",
        ST_Y(dropoff_location) AS "dropoffLat",
        ST_X(dropoff_location) AS "dropoffLng",
        dropoff_address AS "dropoffAddress",
        assigned_driver_id AS "assignedDriverId",
        payout_amount_cents AS "payoutAmountCents",
        estimated_distance_km AS "estimatedDistanceKm",
        estimated_duration_minutes AS "estimatedDurationMinutes",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM jobs
      ORDER BY created_at DESC
      LIMIT 50;
    `);

    return {
      jobs: res.rows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        title: row.title,
        description: row.description,
        status: row.status,
        pickup: {
          latitude: parseFloat(row.pickupLat),
          longitude: parseFloat(row.pickupLng),
          address: row.pickupAddress,
        },
        dropoff: {
          latitude: parseFloat(row.dropoffLat),
          longitude: parseFloat(row.dropoffLng),
          address: row.dropoffAddress,
        },
        assignedDriverId: row.assignedDriverId,
        payoutAmountCents: row.payoutAmountCents,
        estimatedDistanceKm: parseFloat(row.estimatedDistanceKm || '0'),
        estimatedDurationMinutes: row.estimatedDurationMinutes,
        createdAt: row.createdAt,
      })),
      count: res.rowCount,
    };
  });

  // POST /api/jobs - Create new job and trigger automated geospatial dispatch
  fastify.post<{ Body: CreateJobDto }>('/jobs', async (req, reply) => {
    const { title, description, pickup, dropoff, payoutAmountCents, requiredVehicleType } = req.body;

    if (!pickup?.latitude || !pickup?.longitude || !dropoff?.latitude || !dropoff?.longitude) {
      return reply.status(400).send({ error: 'Pickup and dropoff coordinates are required' });
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;

    // Insert job into PostGIS
    const insertRes = await query(
      `
      INSERT INTO jobs (
        order_number, title, description, status,
        pickup_location, pickup_address, dropoff_location, dropoff_address,
        payout_amount_cents, required_vehicle_type
      )
      VALUES (
        $1, $2, $3, 'pending',
        ST_SetSRID(ST_MakePoint($4, $5), 4326), $6,
        ST_SetSRID(ST_MakePoint($7, $8), 4326), $9,
        $10, $11
      )
      RETURNING id, order_number AS "orderNumber";
      `,
      [
        orderNumber,
        title || 'Express Logistics Delivery',
        description || '',
        pickup.longitude,
        pickup.latitude,
        pickup.address || 'Pickup Point',
        dropoff.longitude,
        dropoff.latitude,
        dropoff.address || 'Dropoff Point',
        payoutAmountCents || 2500,
        requiredVehicleType || 'car',
      ]
    );

    const createdJobId = insertRes.rows[0].id;

    // Broadcast new job event to dispatcher
    broadcastToDispatcher({
      event: 'console:job_event',
      payload: {
        jobId: createdJobId,
        orderNumber,
        status: 'pending',
        pickup,
        dropoff,
      },
      timestamp: new Date().toISOString(),
    });

    // Automatically trigger geospatial dispatch
    const dispatchResult = await dispatchEngine.dispatchJob(createdJobId);

    return reply.status(201).send({
      success: true,
      jobId: createdJobId,
      orderNumber,
      dispatch: dispatchResult,
    });
  });

  // POST /api/jobs/:id/dispatch - Manually trigger dispatch
  fastify.post<{ Params: { id: string } }>('/jobs/:id/dispatch', async (req, reply) => {
    const { id } = req.params;
    const result = await dispatchEngine.dispatchJob(id);
    return reply.send(result);
  });
};
