import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://fleet_user:fleet_secret_password@localhost:5432/fleetrelay',
    maxConnections: 20,
    idleTimeoutMillis: 30000,
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    streamName: process.env.REDIS_STREAM_NAME || 'telemetry:stream',
    consumerGroup: process.env.REDIS_CONSUMER_GROUP || 'telemetry_writers',
    consumerName: `worker-${process.pid}`,
  },

  telemetry: {
    batchSize: parseInt(process.env.TELEMETRY_BATCH_SIZE || '100', 10),
    flushIntervalMs: parseInt(process.env.TELEMETRY_FLUSH_INTERVAL_MS || '500', 10),
  },

  dispatch: {
    defaultRadiusMeters: parseInt(process.env.DEFAULT_SEARCH_RADIUS_METERS || '5000', 10),
    offerTtlSeconds: parseInt(process.env.DISPATCH_OFFER_TTL_SECONDS || '30', 10),
    minBatteryPercent: parseInt(process.env.MIN_DRIVER_BATTERY_PERCENT || '15', 10),
    maxHeartbeatAgeSeconds: parseInt(process.env.MAX_HEARTBEAT_AGE_SECONDS || '60', 10),
  },
};
