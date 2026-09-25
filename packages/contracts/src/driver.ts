import { Coordinates } from './telemetry';

export type DriverStatus = 'offline' | 'idle' | 'en_route' | 'on_job' | 'break';

export type VehicleType = 'car' | 'van' | 'motorcycle' | 'bicycle' | 'truck';

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  email?: string;
  vehicleType: VehicleType;
  licensePlate: string;
  rating: number; // e.g., 4.95
  status: DriverStatus;
  currentLocation?: Coordinates | null;
  heading?: number;
  batteryLevel?: number;
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DriverStateUpdate {
  driverId: string;
  status?: DriverStatus;
  currentLocation?: Coordinates;
  heading?: number;
  batteryLevel?: number;
}
