-- ============================================================
-- INDUSTRIAL POLLUTION MONITORING SYSTEM
-- DML Script: Insert Sample Data
-- ============================================================

USE pollution_monitoring;

-- -------------------------------------------------------
-- 0. Users Data (6 rows)
-- -------------------------------------------------------
INSERT INTO Users (username, password, full_name, role) VALUES
('admin',      'admin123',   'System Administrator', 'admin'),
('inspector1', 'inspect123', 'Rajesh Kumar',         'inspector'),
('inspector2', 'inspect123', 'Meena Sharma',         'inspector'),
('teacher',    'teacher123', 'Course Teacher',       'teacher'),
('user1',      'user123',    'Priya Verma',          'user'),
('user2',      'user123',    'Deepak Rao',           'user');

-- -------------------------------------------------------
-- 1. Location Data (10 rows)
-- -------------------------------------------------------
INSERT INTO Location (area_name, city) VALUES
('Ankleshwar Industrial Estate',   'Ankleshwar'),
('Peenya Industrial Area',         'Bangalore'),
('Manali Industrial Complex',      'Chennai'),
('Patancheru Industrial Zone',     'Hyderabad'),
('Vapi Industrial Estate',         'Vapi'),
('MIDC Taloja',                    'Navi Mumbai'),
('IIE Pantnagar',                  'Pantnagar'),
('Noida Sector 63',                'Noida'),
('Jhagadia Industrial Estate',     'Bharuch'),
('Pithampur Industrial Area',      'Indore');

-- -------------------------------------------------------
-- 2. Industry Data (15 rows)
-- -------------------------------------------------------
INSERT INTO Industry (industry_name, industry_type, license_number, location_id) VALUES
('Reliance Chemicals Pvt Ltd',     'Chemical',         'LIC-CHM-001', 1),
('Tata Steel Works',               'Steel',            'LIC-STL-002', 2),
('Bharat Petroleum Refinery',      'Petroleum',        'LIC-PET-003', 3),
('Hindustan Zinc Ltd',             'Mining',           'LIC-MIN-004', 4),
('Asian Paints Factory',           'Paint & Coatings', 'LIC-PNT-005', 5),
('UltraTech Cement Plant',         'Cement',           'LIC-CMT-006', 6),
('Grasim Industries',              'Textile',          'LIC-TXT-007', 7),
('Amul Dairy Processing',          'Food Processing',  'LIC-FPR-008', 8),
('Vedanta Aluminium Smelter',      'Mining',           'LIC-MIN-009', 1),
('Dalmia Bharat Cement',           'Cement',           'LIC-CMT-010', 9),
('Indian Oil Refinery',            'Petroleum',        'LIC-PET-011', 3),
('Pidilite Industries',            'Chemical',         'LIC-CHM-012', 5),
('JSW Steel Ltd',                  'Steel',            'LIC-STL-013', 6),
('Marico Ltd',                     'Consumer Goods',   'LIC-CGD-014', 8),
('Cipla Pharma Unit',              'Pharmaceutical',   'LIC-PHR-015', 10);

-- -------------------------------------------------------
-- 3. MonitoringStation Data (12 rows)
-- -------------------------------------------------------
INSERT INTO MonitoringStation (location_id, station_type) VALUES
(1,  'Air'),
(1,  'Water'),
(2,  'Combined'),
(3,  'Air'),
(3,  'Water'),
(4,  'Noise'),
(5,  'Combined'),
(6,  'Air'),
(7,  'Water'),
(8,  'Noise'),
(9,  'Combined'),
(10, 'Air');

-- -------------------------------------------------------
-- 4. PollutionReading Data (20 rows)
-- -------------------------------------------------------
INSERT INTO PollutionReading (station_id, reading_datetime, PM25, PM10, NO2, SO2, water_ph, noise_level) VALUES
(1,  '2025-01-15 08:30:00', 85.50,  150.30, 42.10, 18.90, NULL,   NULL),
(1,  '2025-02-10 09:00:00', 120.00, 210.50, 55.20, 25.40, NULL,   NULL),
(2,  '2025-01-20 10:15:00', NULL,   NULL,   NULL,  NULL,  5.80,   NULL),
(2,  '2025-03-05 11:00:00', NULL,   NULL,   NULL,  NULL,  4.20,   NULL),
(3,  '2025-01-25 07:45:00', 55.30,  98.40,  30.10, 12.60, 7.10,   65.20),
(3,  '2025-04-01 08:00:00', 72.10,  130.20, 40.80, 19.50, 6.80,   70.50),
(4,  '2025-02-14 09:30:00', 95.40,  180.70, 60.30, 30.10, NULL,   NULL),
(4,  '2025-03-20 10:00:00', 140.20, 250.80, 75.40, 38.20, NULL,   NULL),
(5,  '2025-01-10 11:30:00', NULL,   NULL,   NULL,  NULL,  3.50,   NULL),
(5,  '2025-05-15 12:00:00', NULL,   NULL,   NULL,  NULL,  6.50,   NULL),
(6,  '2025-02-28 14:00:00', NULL,   NULL,   NULL,  NULL,  NULL,   92.30),
(6,  '2025-06-10 15:00:00', NULL,   NULL,   NULL,  NULL,  NULL,   110.50),
(7,  '2025-03-12 08:15:00', 60.80,  105.20, 28.90, 14.30, 7.50,   58.40),
(7,  '2025-07-01 09:45:00', 88.90,  165.40, 48.70, 22.60, 5.90,   75.20),
(8,  '2025-04-05 10:30:00', 110.30, 195.60, 52.40, 28.70, NULL,   NULL),
(8,  '2025-08-20 11:15:00', 78.50,  140.30, 38.20, 17.80, NULL,   NULL),
(9,  '2025-05-18 07:00:00', NULL,   NULL,   NULL,  NULL,  8.20,   NULL),
(10, '2025-06-22 08:30:00', NULL,   NULL,   NULL,  NULL,  NULL,   88.60),
(11, '2025-07-14 09:00:00', 68.40,  120.50, 35.60, 16.40, 7.00,   62.30),
(12, '2025-08-30 10:00:00', 92.10,  170.80, 45.30, 21.90, NULL,   NULL);

-- -------------------------------------------------------
-- 5. Inspection Data (15 rows)
-- -------------------------------------------------------
INSERT INTO Inspection (industry_id, inspection_date, inspector_name, remarks, result) VALUES
(1,  '2025-01-20', 'Rajesh Kumar',    'High SO2 emissions detected near furnace area.',                'Fail'),
(2,  '2025-02-05', 'Meena Sharma',    'All parameters within limits. Good maintenance.',              'Pass'),
(3,  '2025-02-15', 'Anil Gupta',      'Water discharge slightly acidic. Advised corrective action.',  'Warning'),
(4,  '2025-03-01', 'Sunita Patel',    'Excessive noise from grinding units.',                         'Fail'),
(5,  '2025-03-10', 'Vikram Singh',    'Water pH dangerously low. Immediate action needed.',           'Fail'),
(6,  '2025-04-12', 'Priya Verma',     'Minor dust emission. Within tolerable range.',                 'Pass'),
(7,  '2025-04-20', 'Deepak Rao',      'All readings normal. Industry compliant.',                     'Pass'),
(8,  '2025-05-15', 'Kavita Nair',     'Noise levels marginally high during peak hours.',              'Warning'),
(9,  '2025-06-01', 'Ravi Menon',      'Severe air pollution. PM2.5 exceeds safe limits.',             'Fail'),
(10, '2025-06-20', 'Anjali Deshpande','Effluent treatment plant functioning well.',                   'Pass'),
(1,  '2025-07-05', 'Rajesh Kumar',    'Follow-up: Emissions reduced after installing filters.',       'Pass'),
(3,  '2025-08-14', 'Anil Gupta',      'Water pH improved. Still requires monitoring.',                'Warning'),
(5,  '2025-09-01', 'Vikram Singh',    'Follow-up: pH levels normalized after treatment.',             'Pass'),
(11, '2025-09-18', 'Meena Sharma',    'Stack emission exceeds limits during night shifts.',           'Fail'),
(15, '2025-10-05', 'Sunita Patel',    'Pharmaceutical waste disposal needs improvement.',             'Warning');

-- -------------------------------------------------------
-- 6. Violation Data (10 rows)
-- -------------------------------------------------------
INSERT INTO Violation (industry_id, reading_id, violation_type, penalty_amount, status) VALUES
(1,  2,  'Air',   50000.00,  'Resolved'),
(3,  9,  'Water', 75000.00,  'Pending'),
(4,  11, 'Noise', 30000.00,  'Pending'),
(9,  2,  'Air',   100000.00, 'Appealed'),
(5,  9,  'Water', 85000.00,  'Resolved'),
(4,  12, 'Noise', 45000.00,  'Pending'),
(1,  8,  'Air',   60000.00,  'Resolved'),
(11, 8,  'Air',   55000.00,  'Pending'),
(3,  4,  'Water', 40000.00,  'Resolved'),
(15, 20, 'Air',   35000.00,  'Pending');

-- Verify data insertion
SELECT 'Users' AS TableName, COUNT(*) AS RowCount FROM Users
UNION ALL
SELECT 'Location',           COUNT(*) FROM Location
UNION ALL
SELECT 'Industry',           COUNT(*) FROM Industry
UNION ALL
SELECT 'MonitoringStation',  COUNT(*) FROM MonitoringStation
UNION ALL
SELECT 'PollutionReading',   COUNT(*) FROM PollutionReading
UNION ALL
SELECT 'Inspection',         COUNT(*) FROM Inspection
UNION ALL
SELECT 'Violation',          COUNT(*) FROM Violation;
