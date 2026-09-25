import { redis } from '../redis';
import { config } from '../config';
import { batchInsertTelemetryRecords, updateDriverLocation } from '../db';
import { IngestedCoordinateRecord } from '@fleetrelay/contracts';

export class TelemetryBatchWorker {
  private isRunning: boolean = false;
  private pendingRecords: IngestedCoordinateRecord[] = [];
  private pendingMessageIds: string[] = [];
  private lastFlushTime: number = Date.now();
  private flushTimer: NodeJS.Timeout | null = null;

  public async start(): Promise<void> {
    this.isRunning = true;
    console.log('[Telemetry Worker] Started stream batching consumer worker...');

    // Regular interval to flush partial batches even during low traffic
    this.flushTimer = setInterval(async () => {
      if (this.pendingRecords.length > 0) {
        await this.flush();
      }
    }, config.telemetry.flushIntervalMs);

    this.pollLoop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.flushTimer) clearInterval(this.flushTimer);
    console.log('[Telemetry Worker] Stopped.');
  }

  private async pollLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Read incoming telemetry streams
        const streams = await redis.xreadgroup(
          'GROUP',
          config.redis.consumerGroup,
          config.redis.consumerName,
          'COUNT',
          config.telemetry.batchSize,
          'BLOCK',
          1000,
          'STREAMS',
          config.redis.streamName,
          '>'
        );

        if (streams && streams.length > 0) {
          const [, messages] = streams[0] as [string, Array<[string, string[]]>];

          for (const [id, fields] of messages) {
            const parsed = this.parseStreamFields(fields);
            if (parsed) {
              this.pendingRecords.push(parsed);
              this.pendingMessageIds.push(id);
            }
          }

          if (this.pendingRecords.length >= config.telemetry.batchSize) {
            await this.flush();
          }
        }
      } catch (err: any) {
        if (this.isRunning) {
          console.error('[Telemetry Worker Error]:', err.message);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  private parseStreamFields(fields: string[]): IngestedCoordinateRecord | null {
    const map: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      map[fields[i]] = fields[i + 1];
    }

    if (!map.driverId || !map.latitude || !map.longitude) return null;

    return {
      driverId: map.driverId,
      latitude: parseFloat(map.latitude),
      longitude: parseFloat(map.longitude),
      speed: parseFloat(map.speed || '0'),
      heading: parseFloat(map.heading || '0'),
      accuracy: map.accuracy ? parseFloat(map.accuracy) : null,
      batteryLevel: parseFloat(map.batteryLevel || '100'),
      timestamp: new Date(map.timestamp || Date.now()),
    };
  }

  public async flush(): Promise<void> {
    if (this.pendingRecords.length === 0) return;

    const recordsToFlush = [...this.pendingRecords];
    const messageIdsToAck = [...this.pendingMessageIds];

    this.pendingRecords = [];
    this.pendingMessageIds = [];
    this.lastFlushTime = Date.now();

    try {
      const startTime = performance.now();

      // 1. Bulk insert historical telemetry pings into PostGIS
      await batchInsertTelemetryRecords(recordsToFlush);

      // 2. Update each driver's latest coordinates in the drivers table
      const latestDriverCoords = new Map<string, IngestedCoordinateRecord>();
      for (const rec of recordsToFlush) {
        latestDriverCoords.set(rec.driverId, rec);
      }

      for (const [, latest] of latestDriverCoords) {
        await updateDriverLocation(
          latest.driverId,
          latest.latitude,
          latest.longitude,
          latest.speed,
          latest.heading,
          latest.batteryLevel
        );
      }

      // 3. Acknowledge messages in Redis stream
      if (messageIdsToAck.length > 0) {
        await redis.xack(config.redis.streamName, config.redis.consumerGroup, ...messageIdsToAck);
      }

      const elapsedMs = (performance.now() - startTime).toFixed(2);
      // Log micro-batch stats periodically
      if (recordsToFlush.length >= 10) {
        console.log(
          `[Telemetry Worker] Flushed ${recordsToFlush.length} coordinates to PostGIS in ${elapsedMs}ms`
        );
      }
    } catch (err) {
      console.error('[Telemetry Worker Flush Error]:', err);
    }
  }
}

export const telemetryBatchWorker = new TelemetryBatchWorker();
