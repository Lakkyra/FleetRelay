import { TelemetryPing, TelemetryBatchPayload } from './telemetry';
import { DriverStatus, DriverProfile } from './driver';
import { JobOrder, JobStatus } from './job';
import { DispatchOffer } from './dispatch';

export type WebSocketChannel = 'driver' | 'dispatch_console';

export enum EventType {
  // Mobile Driver -> Server
  DRIVER_IDENTIFY = 'driver:identify',
  TELEMETRY_PING = 'telemetry:ping',
  TELEMETRY_BATCH = 'telemetry:batch',
  OFFER_ACCEPTED = 'offer:accepted',
  OFFER_DECLINED = 'offer:declined',
  JOB_UPDATE = 'job:update',
  DRIVER_STATUS_CHANGE = 'driver:status_change',

  // Server -> Mobile Driver
  DISPATCH_OFFER = 'dispatch:offer',
  OFFER_REVOKED = 'offer:revoked',
  JOB_ASSIGNED = 'job:assigned',
  GEOFENCE_TRIGGERED = 'geofence:triggered',
  PONG = 'server:pong',

  // Dispatcher Console (Web Dashboard)
  CONSOLE_IDENTIFY = 'console:identify',
  CONSOLE_TELEMETRY_FEED = 'console:telemetry_feed',
  CONSOLE_DRIVER_STATE = 'console:driver_state',
  CONSOLE_JOB_EVENT = 'console:job_event',
  CONSOLE_METRICS_TICK = 'console:metrics_tick',
}

export interface WsMessage<T = unknown> {
  event: EventType;
  payload: T;
  timestamp: string;
}

export interface DriverIdentifyPayload {
  driverId: string;
  appVersion?: string;
  deviceModel?: string;
}

export interface OfferResponsePayload {
  offerId: string;
  jobId: string;
  driverId: string;
  accepted: boolean;
  declineReason?: string;
}

export interface GeofenceTriggerPayload {
  jobId: string;
  driverId: string;
  type: 'pickup_arrival' | 'dropoff_arrival';
  radiusMeters: number;
  timestamp: string;
}

export interface SystemMetricsSnapshot {
  activeDriversCount: number;
  idleDriversCount: number;
  activeJobsCount: number;
  telemetryIngestionRatePerSec: number;
  avgSpatialQueryLatencyMs: number;
  totalCoordinatesIngested: number;
  redisStreamPendingCount: number;
}
