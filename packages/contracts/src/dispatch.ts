import { Coordinates } from './telemetry';
import { DriverProfile, VehicleType } from './driver';
import { JobOrder } from './job';

export interface SpatialQueryParams {
  pickupLocation: Coordinates;
  searchRadiusMeters: number;
  maxCandidates?: number;
  requiredVehicleType?: VehicleType;
  excludeDriverIds?: string[];
}

export interface MatchedDriverCandidate {
  driver: DriverProfile;
  distanceMeters: number;
  estimatedArrivalMinutes: number;
  score: number; // 0-100 composite ranking based on distance, rating, battery, heading
  scoreBreakdown: {
    proximityScore: number;
    ratingScore: number;
    headingAlignmentScore: number;
    batteryHealthScore: number;
  };
}

export interface DispatchOffer {
  offerId: string;
  job: JobOrder;
  driverId: string;
  distanceToPickupMeters: number;
  estimatedArrivalMinutes: number;
  expiresAt: string;       // ISO-8601 string, typically 30s TTL
  ttlSeconds: number;
}

export interface DispatchResult {
  jobId: string;
  success: boolean;
  status: 'offered' | 'no_drivers_available' | 'locked';
  dispatchedDriverId?: string;
  candidatesCount: number;
  queryDurationMs: number;
}
