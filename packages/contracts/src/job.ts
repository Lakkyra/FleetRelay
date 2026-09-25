import { Coordinates } from './telemetry';
import { VehicleType } from './driver';

export type JobStatus =
  | 'pending'
  | 'offered'
  | 'accepted'
  | 'en_route_pickup'
  | 'arrived_pickup'
  | 'in_transit'
  | 'arrived_dropoff'
  | 'completed'
  | 'cancelled';

export interface LocationPoint extends Coordinates {
  address: string;
  geofenceRadiusMeters?: number; // default: 100m for arrival trigger
}

export interface JobOrder {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  status: JobStatus;
  pickup: LocationPoint;
  dropoff: LocationPoint;
  assignedDriverId?: string | null;
  payoutAmountCents: number;
  estimatedDistanceKm: number;
  estimatedDurationMinutes: number;
  requiredVehicleType?: VehicleType;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobDto {
  title: string;
  description?: string;
  pickup: LocationPoint;
  dropoff: LocationPoint;
  payoutAmountCents: number;
  requiredVehicleType?: VehicleType;
}

export interface JobStatusTransitionDto {
  jobId: string;
  driverId: string;
  newStatus: JobStatus;
  currentCoords?: Coordinates;
  timestamp: string;
}
