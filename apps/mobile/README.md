# FleetRelay Mobile Driver App (React Native)

A production-grade mobile client built with **React Native** for field workforce drivers. Designed for high-frequency GPS telemetry streaming, battery conservation, and real-time bi-directional order dispatch coordination.

---

## Key Architectural Highlights

### 1. Battery-Optimized Background Geolocation
* Utilizes **`react-native-background-geolocation`** (Transistor Software) for persistent GPS tracking across iOS and Android even when the app is backgrounded or device is locked.
* **Motion Activity Recognition**: Automatically detects automotive movement vs stationary rest via native device accelerometers.
* **Adaptive Sampling**:
  * While moving: Emits coordinate pings every `distanceFilter: 10m`.
  * While stationary: Enters a `stationaryRadius: 25m` geofence and puts high-power GPS hardware to sleep, reducing battery drain by up to 75%.
  * `stopTimeout: 5`: Pauses location hardware after 5 minutes of inactivity.

### 2. Bi-directional WebSocket Telemetry Streaming
* Resilient WebSocket connection to the FleetRelay Fastify server (`/ws`).
* Automatic reconnection using exponential backoff with random jitter.
* Heartbeat ping/pong intervals keep sockets warm across mobile cell handoffs.

### 3. Fault-Tolerant Offline Queue
* When mobile cellular signal drops in tunnels or dead zones, coordinate pings are automatically enqueued in `OfflineQueue`.
* Upon reconnecting to WebSocket, buffered coordinate pings are flushed as a single `telemetry:batch` payload, preventing lost delivery audit trails.

### 4. Automated Dispatch & Geofencing HUD
* **`JobOfferModal`**: Features a 30-second circular countdown timer matching backend offer TTL.
* **Turn-by-turn Transitions**: Drivers advance through `to_pickup` -> `at_pickup` -> `in_transit` -> `delivered`, triggering PostGIS status updates and customer notifications.

---

## Native Permissions Setup

### Android (`android/app/src/main/AndroidManifest.xml`)
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
```

### iOS (`ios/FleetRelay/Info.plist`)
```xml
<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>processing</string>
</array>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>FleetRelay requires background location tracking to dispatch nearby jobs and transmit real-time delivery telemetry.</string>
<key>NSMotionUsageDescription</key>
<string>FleetRelay uses accelerometer motion data to detect stationary stops and optimize battery consumption.</string>
```

---

## Development & Simulator Mode
The app includes an automatic hardware fallback. If running in Expo Go or web simulator where native background modules are not compiled, `LocationService` starts a realistic coordinate simulation along Manhattan avenues, streaming live pings to the FleetRelay backend.
