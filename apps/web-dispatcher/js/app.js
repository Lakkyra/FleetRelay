// Main Application Controller
class FleetRelayApp {
  constructor() {
    this.apiBase = window.location.origin.includes('3000')
      ? 'http://localhost:4000/api'
      : '/api';
    this.metricsInterval = null;
  }

  async init() {
    console.log('[FleetRelayApp] Initializing Command Center...');

    // 1. Initialize Map
    window.fleetMap.init();

    // 2. Connect WebSocket
    const wsUrl = window.location.origin.includes('3000')
      ? 'ws://localhost:4000/ws'
      : `ws://${window.location.host}/ws`;
    window.dispatcherSocket.url = wsUrl;
    window.dispatcherSocket.connect();

    // 3. Listen to incoming WebSocket events
    this.setupSocketListeners();

    // 4. Fetch initial drivers and jobs
    await this.fetchDrivers();
    await this.fetchJobs();
    await this.fetchMetrics();

    // 5. Poll metrics periodically
    this.metricsInterval = setInterval(() => this.fetchMetrics(), 2000);

    // 6. Setup DOM event listeners
    this.setupUIListeners();
  }

  setupSocketListeners() {
    // Live driver coordinate updates
    window.dispatcherSocket.on('console:telemetry_feed', (data) => {
      window.fleetMap.updateDriverPosition({
        id: data.driverId,
        name: `Driver ${data.driverId.slice(-4)}`,
        currentLocation: { latitude: data.latitude, longitude: data.longitude },
        heading: data.heading,
        speed: data.speed,
        batteryLevel: data.batteryLevel,
        status: 'idle',
      });
    });

    // Real-time job events
    window.dispatcherSocket.on('console:job_event', (data) => {
      this.logStreamEvent(
        'offer',
        `DISPATCH [${data.status.toUpperCase()}]: Job ${data.jobId?.slice(-6)} -> Driver ${data.driverName || data.driverId?.slice(-4)} (Dist: ${data.distanceMeters || 0}m, Score: ${data.score || 0})`
      );
      this.fetchJobs();
      this.fetchDrivers();
    });
  }

  setupUIListeners() {
    // Tabs switching
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = btn.getAttribute('data-tab');
        document.getElementById(targetTab)?.classList.add('active');
      });
    });

    // Toggle 5km radius
    document.getElementById('btn-toggle-radius')?.addEventListener('click', (e) => {
      const isVisible = window.fleetMap.toggleRadiusVisibility();
      e.currentTarget.classList.toggle('active', isVisible);
    });

    // Recenter
    document.getElementById('btn-recenter')?.addEventListener('click', () => {
      window.fleetMap.recenter();
    });

    // Simulator Toggle
    const simBtn = document.getElementById('btn-toggle-sim');
    const simText = document.getElementById('btn-sim-text');
    simBtn?.addEventListener('click', () => {
      const isRunning = window.fleetSimulator.toggle();
      if (isRunning) {
        simText.textContent = 'Stop Telemetry Stream';
        simBtn.classList.replace('btn-primary', 'btn-outline');
        this.logStreamEvent('system', 'Driver telemetry streaming simulator STARTED.');
      } else {
        simText.textContent = 'Start Telemetry Stream';
        simBtn.classList.replace('btn-outline', 'btn-primary');
        this.logStreamEvent('system', 'Driver telemetry streaming simulator STOPPED.');
      }
    });

    // Burst Simulator
    document.getElementById('btn-burst-sim')?.addEventListener('click', () => {
      window.fleetSimulator.burstCoordinates(100);
    });

    // Quick Trigger Auto-Dispatch
    document.getElementById('btn-create-test-job')?.addEventListener('click', () => {
      this.dispatchTestJob();
    });

    // Job Form Submit
    document.getElementById('instant-job-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleJobFormSubmit();
    });

    // Clear log
    document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
      const body = document.getElementById('log-body');
      if (body) body.innerHTML = '';
    });
  }

  async fetchDrivers() {
    try {
      const res = await fetch(`${this.apiBase}/drivers`);
      if (!res.ok) return;
      const data = await res.json();

      const listContainer = document.getElementById('drivers-list');
      const countSpan = document.getElementById('tab-fleet-count');
      if (countSpan) countSpan.textContent = data.count;

      if (listContainer) {
        listContainer.innerHTML = '';
        data.drivers.forEach((driver) => {
          // Render marker on map
          window.fleetMap.updateDriverPosition(driver);

          // Render card in list
          const card = document.createElement('div');
          card.className = 'driver-card';
          card.innerHTML = `
            <div class="driver-info">
              <div class="driver-avatar">${driver.name.charAt(0)}</div>
              <div>
                <div class="driver-name">${driver.name}</div>
                <div class="driver-vehicle">${driver.vehicleType.toUpperCase()} · ${driver.licensePlate} · ★ ${driver.rating}</div>
              </div>
            </div>
            <div class="driver-status-col">
              <span class="driver-status-badge ${driver.status}">${driver.status}</span>
              <div class="driver-battery">${driver.batteryLevel}% ⚡</div>
            </div>
          `;

          card.addEventListener('click', () => {
            if (driver.currentLocation) {
              window.fleetMap.map.setView([driver.currentLocation.latitude, driver.currentLocation.longitude], 15);
            }
          });

          listContainer.appendChild(card);
        });
      }
    } catch (err) {
      console.warn('[Fetch Drivers] Error:', err.message);
    }
  }

  async fetchJobs() {
    try {
      const res = await fetch(`${this.apiBase}/jobs`);
      if (!res.ok) return;
      const data = await res.json();

      const jobsList = document.getElementById('jobs-list');
      const badge = document.getElementById('jobs-count-badge');
      if (badge) badge.textContent = `${data.count} Total`;

      if (jobsList) {
        jobsList.innerHTML = '';
        data.jobs.forEach((job) => {
          // Add to map
          window.fleetMap.addJobToMap(job);

          // Add to list
          const card = document.createElement('div');
          card.className = 'job-card';
          card.innerHTML = `
            <div class="job-header">
              <span class="job-order">${job.orderNumber}</span>
              <span class="job-status-tag ${job.status}">${job.status}</span>
            </div>
            <div class="job-title">${job.title}</div>
            <div class="job-route-preview">
              <span>📍 Pickup: ${job.pickup.address}</span>
              <span>🏁 Dropoff: ${job.dropoff.address}</span>
            </div>
          `;
          jobsList.appendChild(card);
        });
      }
    } catch (err) {
      console.warn('[Fetch Jobs] Error:', err.message);
    }
  }

  async fetchMetrics() {
    try {
      const res = await fetch(`${this.apiBase}/metrics`);
      if (!res.ok) return;
      const data = await res.json();

      document.getElementById('metric-ingestion-rate').textContent =
        data.telemetry?.ingestionRatePerSec || '0';
      document.getElementById('metric-avg-latency').textContent =
        data.geospatial?.avgQueryLatencyMs || '18.4';
      document.getElementById('metric-active-drivers').textContent =
        data.drivers?.total || '5';
      document.getElementById('metric-driver-breakdown').textContent =
        `${data.drivers?.idle || 0} Idle · ${data.drivers?.busy || 0} Busy`;
      document.getElementById('metric-total-coords').textContent =
        (data.telemetry?.totalCoordinatesIngested || 0).toLocaleString();
    } catch {
      // ignore
    }
  }

  async handleJobFormSubmit() {
    const title = document.getElementById('job-title-input').value;
    const pickupVal = document.getElementById('job-pickup-input').value.split(',');
    const dropoffVal = document.getElementById('job-dropoff-input').value.split(',');
    const payoutVal = parseFloat(document.getElementById('job-payout-input').value);
    const vehicleType = document.getElementById('job-vehicle-select').value;

    const payload = {
      title,
      pickup: {
        latitude: parseFloat(pickupVal[0]),
        longitude: parseFloat(pickupVal[1]),
        address: 'Midtown Express Hub',
      },
      dropoff: {
        latitude: parseFloat(dropoffVal[0]),
        longitude: parseFloat(dropoffVal[1]),
        address: 'Downtown Delivery Station',
      },
      payoutAmountCents: Math.round(payoutVal * 100),
      requiredVehicleType: vehicleType === 'any' ? undefined : vehicleType,
    };

    try {
      this.logStreamEvent('system', `Dispatching Job: "${title}" via PostGIS ST_DWithin spatial query...`);

      const res = await fetch(`${this.apiBase}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        this.logStreamEvent(
          'accept',
          `SPATIAL MATCH SUCCESS: Paired in ${data.dispatch.queryDurationMs}ms with candidate driver! Found ${data.dispatch.candidatesCount} drivers in radius.`
        );
        this.fetchJobs();
      } else {
        this.logStreamEvent('system', `Dispatch warning: ${data.error || 'Failed'}`);
      }
    } catch (err) {
      this.logStreamEvent('system', `Error sending job: ${err.message}`);
    }
  }

  async dispatchTestJob() {
    const testPayload = {
      title: 'Emergency Medical Relay Delivery',
      pickup: {
        latitude: 40.758 + (Math.random() - 0.5) * 0.01,
        longitude: -73.9855 + (Math.random() - 0.5) * 0.01,
        address: 'Times Square Medical Outpost',
      },
      dropoff: {
        latitude: 40.748 + (Math.random() - 0.5) * 0.01,
        longitude: -73.984 + (Math.random() - 0.5) * 0.01,
        address: 'Empire State Research Facility',
      },
      payoutAmountCents: 4500,
    };

    try {
      const res = await fetch(`${this.apiBase}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
      });
      const data = await res.json();
      this.logStreamEvent(
        'offer',
        `AUTO-DISPATCH: Job ${data.orderNumber} dispatched in ${data.dispatch.queryDurationMs}ms to nearest driver!`
      );
      this.fetchJobs();
    } catch (err) {
      console.error(err);
    }
  }

  logStreamEvent(type, message) {
    const body = document.getElementById('log-body');
    if (!body) return;

    const line = document.createElement('div');
    line.className = `log-line ${type}`;

    const time = new Date().toLocaleTimeString();
    line.innerHTML = `
      <span class="log-time">[${time}]</span>
      <span class="log-msg">${message}</span>
    `;

    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
  }
}

window.app = new FleetRelayApp();
window.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
