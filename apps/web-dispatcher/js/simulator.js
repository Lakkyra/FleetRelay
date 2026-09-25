// Fleet Telemetry Simulator
class FleetSimulator {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.drivers = [
      {
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        name: 'Marcus Vance',
        lat: 40.7580,
        lng: -73.9855,
        heading: 45,
        speed: 8.5,
        battery: 94,
        vehicleType: 'car',
        status: 'idle',
      },
      {
        id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        name: 'Elena Rostova',
        lat: 40.7505,
        lng: -73.9934,
        heading: 180,
        speed: 7.2,
        battery: 88,
        vehicleType: 'van',
        status: 'idle',
      },
      {
        id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
        name: 'Darius Cole',
        lat: 40.7420,
        lng: -73.9880,
        heading: 90,
        speed: 11.0,
        battery: 76,
        vehicleType: 'motorcycle',
        status: 'idle',
      },
      {
        id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
        name: 'Sofia Martinez',
        lat: 40.7614,
        lng: -73.9776,
        heading: 270,
        speed: 9.0,
        battery: 98,
        vehicleType: 'car',
        status: 'idle',
      },
      {
        id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
        name: 'Kenji Sato',
        lat: 40.7308,
        lng: -73.9973,
        heading: 120,
        speed: 5.5,
        battery: 62,
        vehicleType: 'bicycle',
        status: 'on_job',
      },
    ];
  }

  toggle() {
    if (this.isRunning) {
      this.stop();
      return false;
    } else {
      this.start();
      return true;
    }
  }

  start() {
    this.isRunning = true;
    console.log('[Simulator] Started continuous driver telemetry stream.');

    this.intervalId = setInterval(() => {
      this.step();
    }, 1500);
  }

  stop() {
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.log('[Simulator] Stopped.');
  }

  step() {
    this.drivers.forEach((driver) => {
      // Advance driver according to heading & speed
      const speedMs = driver.speed + (Math.random() * 2 - 1);
      const deltaLat = (Math.cos((driver.heading * Math.PI) / 180) * speedMs * 1.5) / 111320;
      const deltaLng =
        (Math.sin((driver.heading * Math.PI) / 180) * speedMs * 1.5) /
        (111320 * Math.cos((driver.lat * Math.PI) / 180));

      driver.lat += deltaLat;
      driver.lng += deltaLng;

      // Random turn
      if (Math.random() > 0.8) {
        driver.heading = (driver.heading + (Math.random() > 0.5 ? 45 : -45) + 360) % 360;
      }

      driver.battery = Math.max(15, driver.battery - 0.005);

      const ping = {
        driverId: driver.id,
        coords: {
          latitude: Number(driver.lat.toFixed(6)),
          longitude: Number(driver.lng.toFixed(6)),
          accuracy: 4.5,
        },
        speed: Number(speedMs.toFixed(2)),
        heading: Math.round(driver.heading),
        isMoving: true,
        batteryLevel: Math.round(driver.battery),
        timestamp: new Date().toISOString(),
      };

      // 1. Emit via WebSocket
      window.dispatcherSocket.send('telemetry:ping', ping);

      // 2. Also update map immediately
      window.fleetMap.updateDriverPosition({
        ...driver,
        currentLocation: ping.coords,
        heading: ping.heading,
        speed: ping.speed,
        batteryLevel: ping.batteryLevel,
      });

      // 3. Log event
      window.app?.logStreamEvent('ping', `PING [${driver.name}]: ${ping.coords.latitude}, ${ping.coords.longitude} (${(ping.speed * 3.6).toFixed(0)} km/h)`);
    });
  }

  burstCoordinates(count = 100) {
    console.log(`[Simulator] Firing ${count} coordinates burst...`);
    const pings = [];
    const baseDriver = this.drivers[0];

    for (let i = 0; i < count; i++) {
      pings.push({
        driverId: baseDriver.id,
        coords: {
          latitude: baseDriver.lat + (Math.random() - 0.5) * 0.01,
          longitude: baseDriver.lng + (Math.random() - 0.5) * 0.01,
          accuracy: 3.5,
        },
        speed: 10.0,
        heading: 45,
        batteryLevel: 90,
        timestamp: new Date().toISOString(),
      });
    }

    // Send batch over WebSocket
    window.dispatcherSocket.send('telemetry:batch', {
      driverId: baseDriver.id,
      pings,
      sentAt: new Date().toISOString(),
    });

    window.app?.logStreamEvent('system', `BURST: Ingested ${count} coordinates into Redis Stream buffer.`);
  }
}

window.fleetSimulator = new FleetSimulator();
