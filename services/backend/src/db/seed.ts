import { pool, query } from './index';

export async function seedDatabase() {
  console.log('[Seed] Populating PostGIS with sample fleet drivers and dispatch jobs...');

  // Sample drivers distributed around Manhattan, NYC
  const drivers = [
    {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      name: 'Marcus Vance',
      phone: '+1-212-555-0143',
      vehicle_type: 'car',
      license_plate: 'NYC-7842',
      rating: 4.96,
      status: 'idle',
      lat: 40.7580, // Times Square
      lng: -73.9855,
      heading: 45.0,
      battery: 94.0,
    },
    {
      id: 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      name: 'Elena Rostova',
      phone: '+1-212-555-0189',
      vehicle_type: 'van',
      license_plate: 'FLEET-901',
      rating: 4.92,
      status: 'idle',
      lat: 40.7505, // Penn Station
      lng: -73.9934,
      heading: 180.0,
      battery: 88.5,
    },
    {
      id: 'c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
      name: 'Darius Cole',
      phone: '+1-212-555-0211',
      vehicle_type: 'motorcycle',
      license_plate: 'MOTO-554',
      rating: 4.88,
      status: 'idle',
      lat: 40.7420, // Flatiron
      lng: -73.9880,
      heading: 90.0,
      battery: 76.0,
    },
    {
      id: 'd3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44',
      name: 'Sofia Martinez',
      phone: '+1-212-555-0377',
      vehicle_type: 'car',
      license_plate: 'NYC-3321',
      rating: 4.98,
      status: 'idle',
      lat: 40.7614, // MoMA / Midtown
      lng: -73.9776,
      heading: 270.0,
      battery: 98.0,
    },
    {
      id: 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55',
      name: 'Kenji Sato',
      phone: '+1-212-555-0455',
      vehicle_type: 'bicycle',
      license_plate: 'BIKE-12',
      rating: 4.90,
      status: 'on_job',
      lat: 40.7308, // Washington Square Park
      lng: -73.9973,
      heading: 120.0,
      battery: 62.0,
    },
  ];

  for (const d of drivers) {
    await query(
      `
      INSERT INTO drivers (
        id, name, phone, vehicle_type, license_plate, rating, status,
        current_location, heading, battery_level, last_heartbeat
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, $11, NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        current_location = EXCLUDED.current_location,
        status = EXCLUDED.status,
        battery_level = EXCLUDED.battery_level,
        last_heartbeat = NOW();
      `,
      [d.id, d.name, d.phone, d.vehicle_type, d.license_plate, d.rating, d.status, d.lng, d.lat, d.heading, d.battery]
    );
  }

  // Sample pending job
  await query(`
    INSERT INTO jobs (
      id, order_number, title, description, status,
      pickup_location, pickup_address, dropoff_location, dropoff_address,
      payout_amount_cents, estimated_distance_km, estimated_duration_minutes
    )
    VALUES (
      'f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a66',
      'ORD-78921',
      'High Priority Medical Specimen Delivery',
      'Time-critical lab sample transfer from Mount Sinai to NYU Langone',
      'pending',
      ST_SetSRID(ST_MakePoint(-73.9890, 40.7530), 4326), -- Bryant Park area
      '476 5th Ave, New York, NY 10018',
      ST_SetSRID(ST_MakePoint(-73.9739, 40.7423), 4326), -- NYU Langone
      '550 1st Avenue, New York, NY 10016',
      3500,
      3.2,
      14
    )
    ON CONFLICT (order_number) DO NOTHING;
  `);

  console.log('[Seed] Database seeded with 5 drivers and sample pending job.');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
