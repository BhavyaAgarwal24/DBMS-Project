-- ============================================================
-- INDUSTRIAL POLLUTION MONITORING SYSTEM
-- DDL Script: Create Tables
-- Database: MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS pollution_monitoring;
USE pollution_monitoring;

-- Drop tables in reverse dependency order (if they already exist)
DROP TABLE IF EXISTS Violation;
DROP TABLE IF EXISTS Inspection;
DROP TABLE IF EXISTS PollutionReading;
DROP TABLE IF EXISTS MonitoringStation;
DROP TABLE IF EXISTS Industry;
DROP TABLE IF EXISTS Location;
DROP TABLE IF EXISTS Users;

-- ============================================================
-- 0. Users Table
-- ============================================================
CREATE TABLE Users (
    user_id      INT           PRIMARY KEY AUTO_INCREMENT,
    username     VARCHAR(50)   NOT NULL UNIQUE,
    password     VARCHAR(255)  NOT NULL,
    full_name    VARCHAR(100)  NOT NULL,
    role         VARCHAR(20)   NOT NULL
        CHECK (role IN ('admin', 'user', 'inspector', 'teacher')),
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 1. Location Table
-- ============================================================
CREATE TABLE Location (
    location_id   INT           PRIMARY KEY AUTO_INCREMENT,
    area_name     VARCHAR(100)  NOT NULL,
    city          VARCHAR(100)  NOT NULL
);

-- ============================================================
-- 2. Industry Table
-- ============================================================
CREATE TABLE Industry (
    industry_id    INT           PRIMARY KEY AUTO_INCREMENT,
    industry_name  VARCHAR(150)  NOT NULL,
    industry_type  VARCHAR(100)  NOT NULL,
    license_number VARCHAR(50)   NOT NULL UNIQUE,
    location_id    INT           NOT NULL,
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 3. MonitoringStation Table
-- ============================================================
CREATE TABLE MonitoringStation (
    station_id    INT           PRIMARY KEY AUTO_INCREMENT,
    location_id   INT           NOT NULL,
    station_type  VARCHAR(50)   NOT NULL
        CHECK (station_type IN ('Air', 'Water', 'Noise', 'Combined')),
    FOREIGN KEY (location_id) REFERENCES Location(location_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 4. PollutionReading Table
-- ============================================================
CREATE TABLE PollutionReading (
    reading_id        INT           PRIMARY KEY AUTO_INCREMENT,
    station_id        INT           NOT NULL,
    reading_datetime  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PM25              DECIMAL(7,2)  CHECK (PM25 >= 0),
    PM10              DECIMAL(7,2)  CHECK (PM10 >= 0),
    NO2               DECIMAL(7,2)  CHECK (NO2  >= 0),
    SO2               DECIMAL(7,2)  CHECK (SO2  >= 0),
    water_ph          DECIMAL(4,2)  CHECK (water_ph BETWEEN 0 AND 14),
    noise_level       DECIMAL(6,2)  CHECK (noise_level >= 0),
    FOREIGN KEY (station_id) REFERENCES MonitoringStation(station_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 5. Inspection Table
-- ============================================================
CREATE TABLE Inspection (
    inspection_id    INT           PRIMARY KEY AUTO_INCREMENT,
    industry_id      INT           NOT NULL,
    inspection_date  DATE          NOT NULL,
    inspector_name   VARCHAR(100)  NOT NULL,
    remarks          TEXT,
    result           VARCHAR(20)   NOT NULL
        CHECK (result IN ('Pass', 'Fail', 'Warning')),
    FOREIGN KEY (industry_id) REFERENCES Industry(industry_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- 6. Violation Table
-- ============================================================
CREATE TABLE Violation (
    violation_id    INT            PRIMARY KEY AUTO_INCREMENT,
    industry_id     INT            NOT NULL,
    reading_id      INT            NOT NULL,
    violation_type  VARCHAR(50)    NOT NULL
        CHECK (violation_type IN ('Air', 'Water', 'Noise')),
    penalty_amount  DECIMAL(12,2)  NOT NULL CHECK (penalty_amount >= 0),
    status          VARCHAR(20)    NOT NULL DEFAULT 'Pending'
        CHECK (status IN ('Pending', 'Resolved', 'Appealed')),
    FOREIGN KEY (industry_id) REFERENCES Industry(industry_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY (reading_id) REFERENCES PollutionReading(reading_id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Verify table creation
SHOW TABLES;
