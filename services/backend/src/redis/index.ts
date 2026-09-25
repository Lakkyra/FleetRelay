import Redis from 'ioredis';
import { config } from '../config';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

export const redisSub = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

const REDIS_GEO_KEY = 'fleet:drivers:geo';

export async function initRedis(): Promise<void> {
  try {
    await redis.connect();
    await redisSub.connect();
    console.log('[Redis] Connected successfully to Redis server at', config.redis.url);

    // Initialize Redis Stream Consumer Group for Telemetry Ingestion
    try {
      await redis.xgroup(
        'CREATE',
        config.redis.streamName,
        config.redis.consumerGroup,
        '0',
        'MKSTREAM'
      );
      console.log(`[Redis Stream] Consumer group created: ${config.redis.consumerGroup}`);
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        console.warn('[Redis Stream] Consumer group init warning:', err.message);
      }
    }
  } catch (err) {
    console.error('[Redis] Connection failed:', err);
  }
}

/**
 * Updates driver position in Redis GEO set for microsecond radius lookups.
 * Redis GEO commands expect longitude first, then latitude.
 */
export async function updateDriverGeo(driverId: string, longitude: number, latitude: number) {
  return redis.geoadd(REDIS_GEO_KEY, longitude, latitude, driverId);
}

/**
 * Ultra-fast in-memory radius lookup from Redis.
 */
export async function findNearbyDriverIdsInRedis(
  longitude: number,
  latitude: number,
  radiusMeters: number
): Promise<string[]> {
  const results = (await redis.georadius(
    REDIS_GEO_KEY,
    longitude,
    latitude,
    radiusMeters,
    'm',
    'WITHDIST',
    'ASC'
  )) as Array<[string, string]>;

  return results.map(([driverId]) => driverId);
}

/**
 * Appends a raw coordinate ping into the Redis Stream for asynchronous micro-batching.
 */
export async function appendToTelemetryStream(data: Record<string, string | number>) {
  const flattened: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    flattened.push(key, String(val));
  }
  return redis.xadd(config.redis.streamName, '*', ...flattened);
}

/**
 * Distributed mutex lock using SET NX PX to prevent race conditions during dispatch.
 */
export async function acquireLock(key: string, ttlMs: number = 30000): Promise<boolean> {
  const result = await redis.set(`lock:${key}`, '1', 'PX', ttlMs, 'NX');
  return result === 'OK';
}

export async function releaseLock(key: string): Promise<void> {
  await redis.del(`lock:${key}`);
}
