-- FleetRelay Spatial Database Schema (PostgreSQL + PostGIS)
-- Optimized for high-throughput coordinate ingestion and sub-40ms spatial dispatch

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Drivers Table
CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(120),
    vehicle_type VARCHAR(30) NOT NULL DEFAULT 'car',
    license_plate VARCHAR(30) NOT NULL,
    rating NUMERIC(3, 2) NOT NULL DEFAULT 5.00,
    status VARCHAR(20) NOT NULL DEFAULT 'offline', -- offline, idle, en_route, on_job, break
    current_location GEOMETRY(Point, 4326),
    heading NUMERIC(5, 1) DEFAULT 0.0,
    speed NUMERIC(5, 2) DEFAULT 0.0,
    battery_level NUMERIC(4, 1) DEFAULT 100.0,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial GIST index for ST_DWithin and KNN distance queries
CREATE INDEX IF NOT EXISTS idx_drivers_current_location ON drivers USING GIST (current_location);
CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers (status);
CREATE INDEX IF NOT EXISTS idx_drivers_last_heartbeat ON drivers (last_heartbeat);

-- 2. Telemetry History Table
-- Retains spatial traces for replay, audit, analytics, and billing
CREATE TABLE IF NOT EXISTS driver_telemetry_history (
    id BIGSERIAL PRIMARY KEY,
    driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    location GEOMETRY(Point, 4326) NOT NULL,
    speed NUMERIC(6, 2) NOT NULL DEFAULT 0.0,
    heading NUMERIC(5, 1) NOT NULL DEFAULT 0.0,
    accuracy NUMERIC(6, 2),
    altitude NUMERIC(7, 2),
    battery_level NUMERIC(4, 1) NOT NULL DEFAULT 100.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Spatial index on historical points
CREATE INDEX IF NOT EXISTS idx_telemetry_location ON driver_telemetry_history USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_telemetry_driver_time ON driver_telemetry_history (driver_id, created_at DESC);

-- 3. Jobs / Orders Table
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    pickup_location GEOMETRY(Point, 4326) NOT NULL,
    pickup_address TEXT NOT NULL,
    dropoff_location GEOMETRY(Point, 4326) NOT NULL,
    dropoff_address TEXT NOT NULL,
    assigned_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    payout_amount_cents INTEGER NOT NULL,
    estimated_distance_km NUMERIC(6, 2) DEFAULT 0.0,
    estimated_duration_minutes INTEGER DEFAULT 0,
    required_vehicle_type VARCHAR(30) DEFAULT 'car',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_pickup ON jobs USING GIST (pickup_location);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_driver ON jobs (assigned_driver_id);

-- 4. Geofences Table (Automated arrival triggers)
CREATE TABLE IF NOT EXISTS geofences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
    center_point GEOMETRY(Point, 4326) NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 100,
    trigger_type VARCHAR(30) NOT NULL DEFAULT 'pickup_arrival',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_geofences_center ON geofences USING GIST (center_point);
