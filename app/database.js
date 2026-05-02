const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'pollution_monitoring',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

async function initializeDatabase() {
  const pool = mysql.createPool(DB_CONFIG);
  await pool.query('SELECT 1');
  await createTables(pool);
  await seedDataIfEmpty(pool);
  await seedUsersIfEmpty(pool);
  return pool;
}

async function createTables(pool) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS Users (
      user_id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(50) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      role VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_user_role CHECK (role IN ('admin', 'user', 'inspector', 'teacher'))
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS Location (
      location_id INT PRIMARY KEY AUTO_INCREMENT,
      area_name VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS Industry (
      industry_id INT PRIMARY KEY AUTO_INCREMENT,
      industry_name VARCHAR(150) NOT NULL,
      industry_type VARCHAR(100) NOT NULL,
      license_number VARCHAR(50) NOT NULL UNIQUE,
      location_id INT NOT NULL,
      CONSTRAINT fk_industry_location
        FOREIGN KEY (location_id) REFERENCES Location(location_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS MonitoringStation (
      station_id INT PRIMARY KEY AUTO_INCREMENT,
      location_id INT NOT NULL,
      station_type VARCHAR(50) NOT NULL,
      CONSTRAINT chk_station_type CHECK (station_type IN ('Air', 'Water', 'Noise', 'Combined')),
      CONSTRAINT fk_station_location
        FOREIGN KEY (location_id) REFERENCES Location(location_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS PollutionReading (
      reading_id INT PRIMARY KEY AUTO_INCREMENT,
      station_id INT NOT NULL,
      reading_datetime DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PM25 DECIMAL(7,2) NULL,
      PM10 DECIMAL(7,2) NULL,
      NO2 DECIMAL(7,2) NULL,
      SO2 DECIMAL(7,2) NULL,
      water_ph DECIMAL(4,2) NULL,
      noise_level DECIMAL(6,2) NULL,
      CONSTRAINT chk_pm25 CHECK (PM25 >= 0),
      CONSTRAINT chk_pm10 CHECK (PM10 >= 0),
      CONSTRAINT chk_no2 CHECK (NO2 >= 0),
      CONSTRAINT chk_so2 CHECK (SO2 >= 0),
      CONSTRAINT chk_water_ph CHECK (water_ph BETWEEN 0 AND 14),
      CONSTRAINT chk_noise_level CHECK (noise_level >= 0),
      CONSTRAINT fk_reading_station
        FOREIGN KEY (station_id) REFERENCES MonitoringStation(station_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS Inspection (
      inspection_id INT PRIMARY KEY AUTO_INCREMENT,
      industry_id INT NOT NULL,
      inspection_date DATE NOT NULL,
      inspector_name VARCHAR(100) NOT NULL,
      remarks TEXT NULL,
      result VARCHAR(20) NOT NULL,
      CONSTRAINT chk_inspection_result CHECK (result IN ('Pass', 'Fail', 'Warning')),
      CONSTRAINT fk_inspection_industry
        FOREIGN KEY (industry_id) REFERENCES Industry(industry_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS Violation (
      violation_id INT PRIMARY KEY AUTO_INCREMENT,
      industry_id INT NOT NULL,
      reading_id INT NOT NULL,
      violation_type VARCHAR(50) NOT NULL,
      penalty_amount DECIMAL(12,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Pending',
      CONSTRAINT chk_violation_type CHECK (violation_type IN ('Air', 'Water', 'Noise')),
      CONSTRAINT chk_penalty_amount CHECK (penalty_amount >= 0),
      CONSTRAINT chk_violation_status CHECK (status IN ('Pending', 'Resolved', 'Appealed')),
      CONSTRAINT fk_violation_industry
        FOREIGN KEY (industry_id) REFERENCES Industry(industry_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_violation_reading
        FOREIGN KEY (reading_id) REFERENCES PollutionReading(reading_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
}

async function seedUsersIfEmpty(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM Users');
  if (rows[0].c > 0) {
    return;
  }

  const users = [
    ['admin', 'admin123', 'System Administrator', 'admin'],
    ['inspector1', 'inspect123', 'Rajesh Kumar', 'inspector'],
    ['inspector2', 'inspect123', 'Meena Sharma', 'inspector'],
    ['teacher', 'teacher123', 'Course Teacher', 'teacher'],
    ['user1', 'user123', 'Priya Verma', 'user'],
    ['user2', 'user123', 'Deepak Rao', 'user'],
  ];

  await pool.query(
    'INSERT INTO Users (username, password, full_name, role) VALUES ?',
    [users],
  );
  console.log('Default users created.');
}

async function seedDataIfEmpty(pool) {
  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM Location');
  if (rows[0].c > 0) {
    return;
  }

  await pool.query(
    'INSERT INTO Location (area_name, city) VALUES ?',
    [[
      ['Ankleshwar Industrial Estate', 'Ankleshwar'],
      ['Peenya Industrial Area', 'Bangalore'],
      ['Manali Industrial Complex', 'Chennai'],
      ['Patancheru Industrial Zone', 'Hyderabad'],
      ['Vapi Industrial Estate', 'Vapi'],
      ['MIDC Taloja', 'Navi Mumbai'],
      ['IIE Pantnagar', 'Pantnagar'],
      ['Noida Sector 63', 'Noida'],
      ['Jhagadia Industrial Estate', 'Bharuch'],
      ['Pithampur Industrial Area', 'Indore'],
    ]],
  );

  await pool.query(
    'INSERT INTO Industry (industry_name, industry_type, license_number, location_id) VALUES ?',
    [[
      ['Reliance Chemicals Pvt Ltd', 'Chemical', 'LIC-CHM-001', 1],
      ['Tata Steel Works', 'Steel', 'LIC-STL-002', 2],
      ['Bharat Petroleum Refinery', 'Petroleum', 'LIC-PET-003', 3],
      ['Hindustan Zinc Ltd', 'Mining', 'LIC-MIN-004', 4],
      ['Asian Paints Factory', 'Paint & Coatings', 'LIC-PNT-005', 5],
      ['UltraTech Cement Plant', 'Cement', 'LIC-CMT-006', 6],
      ['Grasim Industries', 'Textile', 'LIC-TXT-007', 7],
      ['Amul Dairy Processing', 'Food Processing', 'LIC-FPR-008', 8],
      ['Vedanta Aluminium Smelter', 'Mining', 'LIC-MIN-009', 1],
      ['Dalmia Bharat Cement', 'Cement', 'LIC-CMT-010', 9],
      ['Indian Oil Refinery', 'Petroleum', 'LIC-PET-011', 3],
      ['Pidilite Industries', 'Chemical', 'LIC-CHM-012', 5],
      ['JSW Steel Ltd', 'Steel', 'LIC-STL-013', 6],
      ['Marico Ltd', 'Consumer Goods', 'LIC-CGD-014', 8],
      ['Cipla Pharma Unit', 'Pharmaceutical', 'LIC-PHR-015', 10],
    ]],
  );

  await pool.query(
    'INSERT INTO MonitoringStation (location_id, station_type) VALUES ?',
    [[
      [1, 'Air'], [1, 'Water'], [2, 'Combined'], [3, 'Air'],
      [3, 'Water'], [4, 'Noise'], [5, 'Combined'], [6, 'Air'],
      [7, 'Water'], [8, 'Noise'], [9, 'Combined'], [10, 'Air'],
    ]],
  );

  await pool.query(
    `INSERT INTO PollutionReading
      (station_id, reading_datetime, PM25, PM10, NO2, SO2, water_ph, noise_level)
      VALUES ?`,
    [[
      [1, '2025-01-15 08:30:00', 85.50, 150.30, 42.10, 18.90, null, null],
      [1, '2025-02-10 09:00:00', 120.00, 210.50, 55.20, 25.40, null, null],
      [2, '2025-01-20 10:15:00', null, null, null, null, 5.80, null],
      [2, '2025-03-05 11:00:00', null, null, null, null, 4.20, null],
      [3, '2025-01-25 07:45:00', 55.30, 98.40, 30.10, 12.60, 7.10, 65.20],
      [3, '2025-04-01 08:00:00', 72.10, 130.20, 40.80, 19.50, 6.80, 70.50],
      [4, '2025-02-14 09:30:00', 95.40, 180.70, 60.30, 30.10, null, null],
      [4, '2025-03-20 10:00:00', 140.20, 250.80, 75.40, 38.20, null, null],
      [5, '2025-01-10 11:30:00', null, null, null, null, 3.50, null],
      [5, '2025-05-15 12:00:00', null, null, null, null, 6.50, null],
      [6, '2025-02-28 14:00:00', null, null, null, null, null, 92.30],
      [6, '2025-06-10 15:00:00', null, null, null, null, null, 110.50],
      [7, '2025-03-12 08:15:00', 60.80, 105.20, 28.90, 14.30, 7.50, 58.40],
      [7, '2025-07-01 09:45:00', 88.90, 165.40, 48.70, 22.60, 5.90, 75.20],
      [8, '2025-04-05 10:30:00', 110.30, 195.60, 52.40, 28.70, null, null],
      [8, '2025-08-20 11:15:00', 78.50, 140.30, 38.20, 17.80, null, null],
      [9, '2025-05-18 07:00:00', null, null, null, null, 8.20, null],
      [10, '2025-06-22 08:30:00', null, null, null, null, null, 88.60],
      [11, '2025-07-14 09:00:00', 68.40, 120.50, 35.60, 16.40, 7.00, 62.30],
      [12, '2025-08-30 10:00:00', 92.10, 170.80, 45.30, 21.90, null, null],
    ]],
  );

  await pool.query(
    `INSERT INTO Inspection
      (industry_id, inspection_date, inspector_name, remarks, result)
      VALUES ?`,
    [[
      [1, '2025-01-20', 'Rajesh Kumar', 'High SO2 emissions detected near furnace area.', 'Fail'],
      [2, '2025-02-05', 'Meena Sharma', 'All parameters within limits. Good maintenance.', 'Pass'],
      [3, '2025-02-15', 'Anil Gupta', 'Water discharge slightly acidic. Advised corrective action.', 'Warning'],
      [4, '2025-03-01', 'Sunita Patel', 'Excessive noise from grinding units.', 'Fail'],
      [5, '2025-03-10', 'Vikram Singh', 'Water pH dangerously low. Immediate action needed.', 'Fail'],
      [6, '2025-04-12', 'Priya Verma', 'Minor dust emission. Within tolerable range.', 'Pass'],
      [7, '2025-04-20', 'Deepak Rao', 'All readings normal. Industry compliant.', 'Pass'],
      [8, '2025-05-15', 'Kavita Nair', 'Noise levels marginally high during peak hours.', 'Warning'],
      [9, '2025-06-01', 'Ravi Menon', 'Severe air pollution. PM2.5 exceeds safe limits.', 'Fail'],
      [10, '2025-06-20', 'Anjali Deshpande', 'Effluent treatment plant functioning well.', 'Pass'],
      [1, '2025-07-05', 'Rajesh Kumar', 'Follow-up: Emissions reduced after installing filters.', 'Pass'],
      [3, '2025-08-14', 'Anil Gupta', 'Water pH improved. Still requires monitoring.', 'Warning'],
      [5, '2025-09-01', 'Vikram Singh', 'Follow-up: pH levels normalized after treatment.', 'Pass'],
      [11, '2025-09-18', 'Meena Sharma', 'Stack emission exceeds limits during night shifts.', 'Fail'],
      [15, '2025-10-05', 'Sunita Patel', 'Pharmaceutical waste disposal needs improvement.', 'Warning'],
    ]],
  );

  await pool.query(
    `INSERT INTO Violation
      (industry_id, reading_id, violation_type, penalty_amount, status)
      VALUES ?`,
    [[
      [1, 2, 'Air', 50000.00, 'Resolved'],
      [3, 9, 'Water', 75000.00, 'Pending'],
      [4, 11, 'Noise', 30000.00, 'Pending'],
      [9, 2, 'Air', 100000.00, 'Appealed'],
      [5, 9, 'Water', 85000.00, 'Resolved'],
      [4, 12, 'Noise', 45000.00, 'Pending'],
      [1, 8, 'Air', 60000.00, 'Resolved'],
      [11, 8, 'Air', 55000.00, 'Pending'],
      [3, 4, 'Water', 40000.00, 'Resolved'],
      [15, 20, 'Air', 35000.00, 'Pending'],
    ]],
  );

  console.log('Database seeded with sample data.');
}

module.exports = { initializeDatabase, DB_CONFIG };
