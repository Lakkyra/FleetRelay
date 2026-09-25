import { Pool, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { IngestedCoordinateRecord } from '@fleetrelay/contracts';

export const pool = new Pool({
  connectionString: config.db.connectionString,
  max: config.db.maxConnections,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
});

pool.on('error', (err) => {
  console.error('[PostGIS Pool Error]: Unexpected client error', err);
});

export interface QueryStats {
  durationMs: number;
  rowCount: number;
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T> & { durationMs: number }> {
  const start = performance.now();
  const res = await pool.query<T>(text, params);
  const durationMs = Number((performance.now() - start).toFixed(2));
  return Object.assign(res, { durationMs });
}

/**
 * Executes a PostGIS spatial query using ST_DWithin and ST_Distance on geography coordinates.
 * Utilizes the GIST spatial index on drivers(current_location).
 */
export async function queryNearbyDrivers(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  limit: number = 10,
  filterIdleOnly: boolean = true
) {
  const statusClause = filterIdleOnly ? `AND status = 'idle'` : '';

  const sql = `
    SELECT
      id,
      name,
      phone,
      vehicle_type AS "vehicleType",
      license_plate AS "licensePlate",
      rating,
      status,
      heading,
      speed,
      battery_level AS "batteryLevel",
      ST_Y(current_location) AS latitude,
      ST_X(current_location) AS longitude,
      ROUND(
        ST_Distance(
          current_location::geography,
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        )::numeric, 2
      ) AS distance_meters,
      last_heartbeat AS "lastHeartbeat"
    FROM drivers
    WHERE
      current_location IS NOT NULL
      ${statusClause}
      AND battery_level >= $4
      AND (last_heartbeat >= NOW() - INTERVAL '120 seconds' OR last_heartbeat IS NULL)
      AND ST_DWithin(
        current_location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    ORDER BY distance_meters ASC
    LIMIT $5;
  `;

  // Note: ST_MakePoint takes (longitude, latitude)
  const params = [longitude, latitude, radiusMeters, config.dispatch.minBatteryPercent, limit];
  return query(sql, params);
}

/**
 * Updates a driver's current coordinates, heading, speed, battery, and heartbeat.
 */
export async function updateDriverLocation(
  driverId: string,
  latitude: number,
  longitude: number,
  speed: number,
  heading: number,
  batteryLevel: number
) {
  const sql = `
    UPDATE drivers
    SET
      current_location = ST_SetSRID(ST_MakePoint($2, $3), 4326),
      speed = $4,
      heading = $5,
      battery_level = $6,
      last_heartbeat = NOW(),
      updated_at = NOW()
    WHERE id = $1;
  `;
  return query(sql, [driverId, longitude, latitude, speed, heading, batteryLevel]);
}

/**
 * High-performance batch insert for telemetry historical pings.
 * Avoids single-row INSERT lock contention and write exhaustion.
 */
export async function batchInsertTelemetryRecords(records: IngestedCoordinateRecord[]) {
  if (records.length === 0) return { rowCount: 0, durationMs: 0 };

  const values: any[] = [];
  const valuePlaceholders: string[] = [];

  records.forEach((rec, idx) => {
    const offset = idx * 7;
    valuePlaceholders.push(
      `($${offset + 1}, ST_SetSRID(ST_MakePoint($${offset + 2}, $${offset + 3}), 4326), $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, NOW())`
    );
    values.push(
      rec.driverId,
      rec.longitude,
      rec.latitude,
      rec.speed || 0,
      rec.heading || 0,
      rec.accuracy || null,
      rec.batteryLevel || 100
    );
  });

  const sql = `
    INSERT INTO driver_telemetry_history (
      driver_id,
      location,
      speed,
      heading,
      accuracy,
      battery_level,
      created_at
    )
    VALUES ${valuePlaceholders.join(', ')};
  `;

  return query(sql, values);
}
