export interface Coordinates {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  accuracy?: number | null;
  altitudeAccuracy?: number | null;
}

export type MotionActivityType = 'still' | 'on_foot' | 'walking' | 'running' | 'in_vehicle' | 'on_bicycle' | 'unknown';

export interface TelemetryPing {
  id?: string;
  driverId: string;
  coords: Coordinates;
  speed: number;            // in meters/second
  heading: number;          // bearing in degrees (0-359.9)
  odometer?: number;        // total distance traveled in meters
  isMoving: boolean;
  activityType?: MotionActivityType;
  batteryLevel: number;     // 0.0 to 1.0 (or percentage 0-100)
  isCharging: boolean;
  timestamp: string;        // ISO-8601 string
}

export interface TelemetryBatchPayload {
  driverId: string;
  pings: TelemetryPing[];
  sentAt: string;
  batchSequenceId?: number;
}

export interface IngestedCoordinateRecord {
  driverId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  accuracy: number | null;
  batteryLevel: number;
  timestamp: Date;
}
