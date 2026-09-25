import { TelemetryPing, TelemetryBatchPayload, IngestedCoordinateRecord } from '@fleetrelay/contracts';
import { updateDriverGeo, appendToTelemetryStream } from '../redis';
import { updateDriverLocation } from '../db';
import { broadcastToDispatcher } from '../websocket/gateway';

// High-speed in-memory metric counters
export const telemetryMetrics = {
  totalCoordinatesIngested: 0,
  recentPingsCount: 0,
  lastThroughputCheck: Date.now(),
  currentIngestionRatePerSec: 0,
  avgSpatialQueryLatencyMs: 0,
  spatialQueryCount: 0,
  totalSpatialQueryTimeMs: 0,
};

// Calculate rolling throughput every second
setInterval(() => {
  const now = Date.now();
  const elapsedSec = (now - telemetryMetrics.lastThroughputCheck) / 1000;
  if (elapsedSec > 0) {
    telemetryMetrics.currentIngestionRatePerSec = Math.round(
      telemetryMetrics.recentPingsCount / elapsedSec
    );
  }
  telemetryMetrics.recentPingsCount = 0;
  telemetryMetrics.lastThroughputCheck = now;
}, 1000);

export function recordSpatialQueryLatency(durationMs: number) {
  telemetryMetrics.spatialQueryCount++;
  telemetryMetrics.totalSpatialQueryTimeMs += durationMs;
  telemetryMetrics.avgSpatialQueryLatencyMs = Number(
    (telemetryMetrics.totalSpatialQueryTimeMs / telemetryMetrics.spatialQueryCount).toFixed(2)
  );
}

/**
 * Ingests a single coordinate ping from a mobile driver.
 * Execution path:
 * 1. Redis GEO update (sub-millisecond)
 * 2. Redis Stream append (asynchronous event log)
 * 3. Broadcast to dispatcher live map
 */
export async function ingestTelemetryPing(ping: TelemetryPing): Promise<void> {
  telemetryMetrics.totalCoordinatesIngested++;
  telemetryMetrics.recentPingsCount++;

  const { driverId, coords, speed, heading, batteryLevel, timestamp } = ping;

  // 1. Fast in-memory Geo cache update
  await updateDriverGeo(driverId, coords.longitude, coords.latitude);

  // 2. Append to Redis Stream for batch worker
  await appendToTelemetryStream({
    driverId,
    latitude: coords.latitude,
    longitude: coords.longitude,
    speed: speed || 0,
    heading: heading || 0,
    accuracy: coords.accuracy || 0,
    altitude: coords.altitude || 0,
    batteryLevel: batteryLevel || 100,
    timestamp: timestamp || new Date().toISOString(),
  });

  // 3. Real-time broadcast to Web Dispatcher console
  broadcastToDispatcher({
    event: 'console:telemetry_feed',
    payload: {
      driverId,
      latitude: coords.latitude,
      longitude: coords.longitude,
      speed,
      heading,
      batteryLevel,
      timestamp,
    },
    timestamp: new Date().toISOString(),
  });
}

/**
 * Ingests a batch of telemetry points flushed by mobile client offline buffer or batch sender.
 */
export async function ingestTelemetryBatch(payload: TelemetryBatchPayload): Promise<number> {
  const { pings } = payload;
  for (const ping of pings) {
    await ingestTelemetryPing(ping);
  }
  return pings.length;
}
