import { TelemetryPing } from '@fleetrelay/contracts';
import { socketService } from './SocketService';

export interface LocationServiceListener {
  onLocationUpdate?: (ping: TelemetryPing) => void;
  onMotionChange?: (isMoving: boolean) => void;
  onGeofenceEnter?: (identifier: string) => void;
}

/**
 * LocationService coordinates react-native-background-geolocation
 * with battery-efficient adaptive tracking algorithms.
 */
export class LocationService {
  private driverId: string | null = null;
  private isTracking: boolean = false;
  private listeners: Set<LocationServiceListener> = new Set();
  private mockInterval: NodeJS.Timeout | null = null;

  // Current driver location cache
  private latestPing: TelemetryPing | null = null;

  public async init(driverId: string): Promise<void> {
    this.driverId = driverId;
    console.log(`[LocationService] Initialized for driver ${driverId}`);
  }

  public subscribe(listener: LocationServiceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getLatestPing(): TelemetryPing | null {
    return this.latestPing;
  }

  /**
   * Starts persistent background geolocation tracking.
   * In physical React Native production, this configures react-native-background-geolocation.
   * Also includes a fallback simulator loop for Expo Go & emulators.
   */
  public async startTracking(): Promise<void> {
    if (this.isTracking) return;
    this.isTracking = true;
    console.log('[LocationService] Persistent background tracking started.');

    try {
      // Attempt to load react-native-background-geolocation if available in native build
      const BackgroundGeolocation = require('react-native-background-geolocation').default;

      await BackgroundGeolocation.ready({
        // Geolocation Config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 10, // record only after moving 10 meters
        stationaryRadius: 25, // create 25m stationary geofence when stopped
        stopTimeout: 5, // wait 5 min of inactivity before shutting down GPS

        // Activity Recognition (battery saver)
        activityType: BackgroundGeolocation.ACTIVITY_TYPE_AUTOMOTIVE_NAVIGATION,
        disableElasticity: false, // adaptively increases GPS sampling with speed
        stopOnStationary: false, // keep running in background

        // Application Config
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_OFF,
        startOnBoot: true,
        stopOnTerminate: false,

        // Background service notifications (Android)
        notification: {
          title: 'FleetRelay Active Dispatch',
          text: 'Sharing high-precision GPS telemetry with dispatch engine.',
          color: '#3b82f6',
          channelName: 'FleetRelay Tracking',
        },
      });

      // Listen for location events from native SDK
      BackgroundGeolocation.onLocation(
        (location: any) => {
          const ping: TelemetryPing = {
            driverId: this.driverId!,
            coords: {
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              altitude: location.coords.altitude,
              accuracy: location.coords.accuracy,
            },
            speed: Math.max(0, location.coords.speed || 0),
            heading: location.coords.heading >= 0 ? location.coords.heading : 0,
            odometer: location.odometer,
            isMoving: location.is_moving,
            activityType: location.activity?.type || 'in_vehicle',
            batteryLevel: Math.round((location.battery?.level || 1) * 100),
            isCharging: location.battery?.is_charging || false,
            timestamp: location.timestamp,
          };

          this.handleNewLocation(ping);
        },
        (error: any) => {
          console.warn('[LocationService] Native Location Error:', error);
        }
      );

      // Start the native service
      await BackgroundGeolocation.start();
    } catch {
      // In web or Expo Go or development environment without native link, use simulator
      console.log('[LocationService] Native background module not compiled; enabling simulated driver telemetry.');
      this.startSimulatedTracking();
    }
  }

  public async stopTracking(): Promise<void> {
    this.isTracking = false;
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }

    try {
      const BackgroundGeolocation = require('react-native-background-geolocation').default;
      await BackgroundGeolocation.stop();
    } catch {
      // ignore
    }

    console.log('[LocationService] Background tracking stopped.');
  }

  private handleNewLocation(ping: TelemetryPing): void {
    this.latestPing = ping;

    // 1. Stream coordinate ping over WebSocket
    socketService.streamTelemetryPing(ping);

    // 2. Notify local UI listeners (e.g. Map view, HUD)
    this.listeners.forEach((l) => l.onLocationUpdate?.(ping));
  }

  /**
   * Simulated tracking for testing in browser / Expo Go without native build
   */
  private startSimulatedTracking(): void {
    let lat = 40.758; // Times Square starting point
    let lng = -73.9855;
    let heading = 45;
    let battery = 96;

    this.mockInterval = setInterval(() => {
      if (!this.isTracking) return;

      // Move driver slowly along a realistic heading
      const speedKmh = 25 + Math.random() * 10;
      const speedMs = speedKmh / 3.6;

      // Small jitter to simulate real GPS coordinates
      const deltaLat = (Math.cos((heading * Math.PI) / 180) * speedMs * 2) / 111320;
      const deltaLng = (Math.sin((heading * Math.PI) / 180) * speedMs * 2) / (111320 * Math.cos((lat * Math.PI) / 180));

      lat += deltaLat;
      lng += deltaLng;

      // Random turn occasionally
      if (Math.random() > 0.8) {
        heading = (heading + (Math.random() > 0.5 ? 90 : -90) + 360) % 360;
      }

      battery = Math.max(10, battery - 0.01);

      const ping: TelemetryPing = {
        driverId: this.driverId || 'sim-driver-1',
        coords: {
          latitude: lat,
          longitude: lng,
          accuracy: 5.0,
        },
        speed: Number(speedMs.toFixed(2)),
        heading: Math.round(heading),
        isMoving: true,
        batteryLevel: Math.round(battery),
        isCharging: false,
        timestamp: new Date().toISOString(),
      };

      this.handleNewLocation(ping);
    }, 2000);
  }
}

export const locationService = new LocationService();
