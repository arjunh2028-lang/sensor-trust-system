-- TimescaleDB / PostgreSQL Schema for Sentinel AI Sensor Trust System

-- 1. Enable TimescaleDB Extension if available
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Sensor Metadata Registry
CREATE TABLE IF NOT EXISTS sensor_metadata (
    sensor_id VARCHAR(64) PRIMARY KEY,
    metric_type VARCHAR(32) NOT NULL,
    unit VARCHAR(16) NOT NULL,
    location_zone VARCHAR(64) NOT NULL,
    firmware_version VARCHAR(32) NOT NULL,
    baseline_nominal DOUBLE PRECISION NOT NULL,
    critical_threshold_high DOUBLE PRECISION NOT NULL,
    critical_threshold_low DOUBLE PRECISION,
    max_physical_slew DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. High-Frequency Time-Series Telemetry Table
CREATE TABLE IF NOT EXISTS sensor_telemetry (
    time TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(64) NOT NULL,
    metric_type VARCHAR(32) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    unit VARCHAR(16) NOT NULL,
    location_zone VARCHAR(64) NOT NULL,
    firmware_version VARCHAR(32) NOT NULL
);

-- Convert to Hypertable (TimescaleDB 1-day chunk interval)
SELECT create_hypertable('sensor_telemetry', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

CREATE INDEX IF NOT EXISTS idx_telemetry_sensor_time ON sensor_telemetry (sensor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_zone_time ON sensor_telemetry (location_zone, time DESC);

-- 4. Real-Time Sensor Trust & Anomaly Status Log
CREATE TABLE IF NOT EXISTS sensor_trust_status (
    time TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(64) NOT NULL,
    trust_score DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL,
    is_false_alarm_suppressed BOOLEAN NOT NULL,
    explanation TEXT NOT NULL,
    spatial_consensus_score DOUBLE PRECISION,
    slew_rate_feasibility DOUBLE PRECISION,
    drift_metric DOUBLE PRECISION,
    noise_entropy_score DOUBLE PRECISION,
    reconstruction_error DOUBLE PRECISION
);

SELECT create_hypertable('sensor_trust_status', 'time', if_not_exists => TRUE, chunk_time_interval => INTERVAL '7 days');
CREATE INDEX IF NOT EXISTS idx_trust_sensor_time ON sensor_trust_status (sensor_id, time DESC);

-- 5. Alert & Incident Log
CREATE TABLE IF NOT EXISTS alerts (
    alert_id VARCHAR(64) PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL,
    sensor_id VARCHAR(64) NOT NULL,
    metric_type VARCHAR(32) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    alert_type VARCHAR(32) NOT NULL, -- 'GENUINE_HAZARD' or 'SUPPRESSED_SENSOR_FAULT'
    location_zone VARCHAR(64) NOT NULL,
    trust_score DOUBLE PRECISION NOT NULL,
    summary VARCHAR(256) NOT NULL,
    explanation TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_time ON alerts (time DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts (alert_type);
