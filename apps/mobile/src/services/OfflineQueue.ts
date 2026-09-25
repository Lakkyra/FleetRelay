import { TelemetryPing } from '@fleetrelay/contracts';

const MAX_OFFLINE_BUFFER_SIZE = 500;

export class OfflineQueue {
  private buffer: TelemetryPing[] = [];

  public enqueue(ping: TelemetryPing): void {
    if (this.buffer.length >= MAX_OFFLINE_BUFFER_SIZE) {
      // Discard oldest pings if capacity reached to avoid memory bloat
      this.buffer.shift();
    }
    this.buffer.push(ping);
  }

  public size(): number {
    return this.buffer.length;
  }

  public drain(maxBatchSize: number = 50): TelemetryPing[] {
    return this.buffer.splice(0, maxBatchSize);
  }

  public clear(): void {
    this.buffer = [];
  }
}

export const offlineQueue = new OfflineQueue();
