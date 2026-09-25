// Interactive Leaflet Map Controller for FleetRelay
class FleetMap {
  constructor() {
    this.map = null;
    this.driverMarkers = new Map(); // driverId -> L.Marker
    this.jobLayers = new Map(); // jobId -> LayerGroup
    this.radiusCircles = new Map(); // driverId -> L.Circle
    this.showRadius = true;
    this.showTrails = false;
    this.trails = new Map(); // driverId -> L.Polyline
  }

  init() {
    // Center on Manhattan, NY
    this.map = L.map('map', {
      center: [40.7530, -73.9850],
      zoom: 13,
      zoomControl: false,
    });

    // Add zoom control in top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // CartoDB Dark Matter tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; OpenStreetMap',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(this.map);

    // Click map to populate form coordinates
    this.map.on('click', (e) => {
      const lat = e.latlng.lat.toFixed(4);
      const lng = e.latlng.lng.toFixed(4);
      const pickupInput = document.getElementById('job-pickup-input');
      if (pickupInput) {
        pickupInput.value = `${lat}, ${lng}`;
      }
    });
  }

  createVehicleIcon(heading = 0, status = 'idle', vehicleType = 'car') {
    const isBusy = status === 'en_route' || status === 'on_job';
    const color = isBusy ? '#3b82f6' : '#10b981';

    const svg = `
      <div class="driver-marker-svg" style="transform: rotate(${heading}deg); width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" fill="#101623" stroke="${color}" stroke-width="2.5" />
          <polygon points="16,6 23,24 16,19 9,24" fill="${color}" />
        </svg>
      </div>
    `;

    return L.divIcon({
      html: svg,
      className: 'vehicle-marker-icon',
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
  }

  updateDriverPosition(driver) {
    const { id, name, currentLocation, heading, speed, batteryLevel, status, vehicleType } = driver;
    if (!currentLocation?.latitude || !currentLocation?.longitude) return;

    const latLng = [currentLocation.latitude, currentLocation.longitude];

    if (this.driverMarkers.has(id)) {
      const marker = this.driverMarkers.get(id);
      marker.setLatLng(latLng);
      marker.setIcon(this.createVehicleIcon(heading, status, vehicleType));

      // Update popup content
      marker.setPopupContent(`
        <div style="font-family: sans-serif; color: #111; min-width: 140px;">
          <h4 style="margin: 0 0 4px; font-size: 13px;">${name}</h4>
          <div style="font-size: 11px; color: #555;">
            <b>Status:</b> ${status}<br>
            <b>Speed:</b> ${(speed * 3.6).toFixed(1)} km/h<br>
            <b>Heading:</b> ${heading}°<br>
            <b>Battery:</b> ${batteryLevel}%
          </div>
        </div>
      `);

      // Update radius circle
      if (this.radiusCircles.has(id)) {
        this.radiusCircles.get(id).setLatLng(latLng);
      }
    } else {
      const marker = L.marker(latLng, {
        icon: this.createVehicleIcon(heading, status, vehicleType),
      }).addTo(this.map);

      marker.bindPopup(`
        <div style="font-family: sans-serif; color: #111; min-width: 140px;">
          <h4 style="margin: 0 0 4px; font-size: 13px;">${name}</h4>
          <div style="font-size: 11px; color: #555;">
            <b>Status:</b> ${status}<br>
            <b>Speed:</b> ${(speed * 3.6).toFixed(1)} km/h<br>
            <b>Heading:</b> ${heading}°<br>
            <b>Battery:</b> ${batteryLevel}%
          </div>
        </div>
      `);

      this.driverMarkers.set(id, marker);

      // Create 5km spatial radius circle
      const circle = L.circle(latLng, {
        radius: 5000,
        color: '#3b82f6',
        weight: 1,
        dashArray: '4, 8',
        fillColor: '#3b82f6',
        fillOpacity: 0.04,
      });

      if (this.showRadius) {
        circle.addTo(this.map);
      }
      this.radiusCircles.set(id, circle);
    }
  }

  addJobToMap(job) {
    if (!job.pickup?.latitude || !job.dropoff?.latitude) return;

    const pickupLatLng = [job.pickup.latitude, job.pickup.longitude];
    const dropoffLatLng = [job.dropoff.latitude, job.dropoff.longitude];

    const layerGroup = L.layerGroup();

    // Pickup Marker (Cyan)
    const pickupMarker = L.circleMarker(pickupLatLng, {
      radius: 8,
      color: '#06b6d4',
      fillColor: '#06b6d4',
      fillOpacity: 0.8,
      weight: 2,
    }).bindPopup(`<b>Pickup:</b> ${job.pickup.address}`);

    // Dropoff Marker (Emerald)
    const dropoffMarker = L.circleMarker(dropoffLatLng, {
      radius: 8,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.8,
      weight: 2,
    }).bindPopup(`<b>Dropoff:</b> ${job.dropoff.address}`);

    // Connecting dashed route line
    const routeLine = L.polyline([pickupLatLng, dropoffLatLng], {
      color: '#06b6d4',
      weight: 2,
      dashArray: '5, 10',
      opacity: 0.7,
    });

    layerGroup.addLayer(pickupMarker);
    layerGroup.addLayer(dropoffMarker);
    layerGroup.addLayer(routeLine);

    layerGroup.addTo(this.map);
    this.jobLayers.set(job.id, layerGroup);
  }

  toggleRadiusVisibility() {
    this.showRadius = !this.showRadius;
    this.radiusCircles.forEach((circle) => {
      if (this.showRadius) {
        circle.addTo(this.map);
      } else {
        this.map.removeLayer(circle);
      }
    });
    return this.showRadius;
  }

  recenter() {
    this.map.setView([40.7530, -73.9850], 13);
  }
}

window.fleetMap = new FleetMap();
