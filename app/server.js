const express = require('express');
const path = require('path');
const { initializeDatabase, DB_CONFIG } = require('./database');

const app = express();
const PORT = 3000;

let db;

async function getDb() {
  if (!db) {
    db = await initializeDatabase();
  }
  return db;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(async (req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    next();
    return;
  }

  try {
    await getDb();
    next();
  } catch (error) {
    res.status(500).json({ error: `Database connection failed: ${error.message}` });
  }
});

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteId(identifier) {
  return `\`${identifier}\``;
}

async function getTableNames() {
  const [rows] = await db.query(
    `SELECT table_name AS name
     FROM information_schema.tables
     WHERE table_schema = ?
     ORDER BY table_name`,
    [DB_CONFIG.database],
  );
  return rows.map((row) => row.name);
}

async function assertValidTable(name) {
  if (!isSafeIdentifier(name)) {
    throw new Error('Invalid table name.');
  }

  const tables = await getTableNames();
  if (!tables.includes(name)) {
    throw new Error(`Unknown table: ${name}`);
  }

  return name;
}

async function getTableSchema(name) {
  const [columns] = await db.query(
    `SELECT
       c.column_name AS name,
       c.column_type AS type,
       CASE WHEN c.is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
       CASE WHEN c.column_key = 'PRI' THEN 1 ELSE 0 END AS pk,
       c.column_default AS defaultValue,
       c.extra AS extra
     FROM information_schema.columns c
     WHERE c.table_schema = ? AND c.table_name = ?
     ORDER BY c.ordinal_position`,
    [DB_CONFIG.database, name],
  );

  const [foreignKeys] = await db.query(
    `SELECT
       kcu.column_name AS column_name,
       kcu.referenced_table_name AS referenced_table_name,
       kcu.referenced_column_name AS referenced_column_name
     FROM information_schema.key_column_usage kcu
     WHERE kcu.table_schema = ?
       AND kcu.table_name = ?
       AND kcu.referenced_table_name IS NOT NULL`,
    [DB_CONFIG.database, name],
  );

  return { columns, foreignKeys };
}

function normalizeValueByColumn(column, value) {
  if (value === '') {
    return null;
  }

  if (typeof value === 'string' && column.type.includes('datetime') && value.includes('T')) {
    return `${value.replace('T', ' ')}:00`;
  }

  return value;
}

function firstResultSet(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  if (rows.length > 0 && Array.isArray(rows[0])) {
    const firstArray = rows.find((row) => Array.isArray(row));
    return firstArray || [];
  }

  return rows;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDecimal(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function pickRandom(items) {
  return items[randomInt(0, items.length - 1)];
}

function buildReadingPayload(stationType) {
  const reading = {
    PM25: null,
    PM10: null,
    NO2: null,
    SO2: null,
    water_ph: null,
    noise_level: null,
  };

  if (stationType === 'Air' || stationType === 'Combined') {
    reading.PM25 = randomDecimal(35, 145);
    reading.PM10 = randomDecimal(70, 260);
    reading.NO2 = randomDecimal(18, 85);
    reading.SO2 = randomDecimal(8, 40);
  }

  if (stationType === 'Water' || stationType === 'Combined') {
    reading.water_ph = randomDecimal(3.8, 8.4);
  }

  if (stationType === 'Noise' || stationType === 'Combined') {
    reading.noise_level = randomDecimal(55, 110);
  }

  return reading;
}

function evaluateInspectionResult(reading) {
  const hasFail =
    (reading.PM25 !== null && reading.PM25 > 100) ||
    (reading.water_ph !== null && reading.water_ph < 5) ||
    (reading.noise_level !== null && reading.noise_level > 85);

  if (hasFail) {
    return 'Fail';
  }

  const hasWarning =
    (reading.PM25 !== null && reading.PM25 > 60) ||
    (reading.water_ph !== null && reading.water_ph < 6.5) ||
    (reading.noise_level !== null && reading.noise_level > 75);

  if (hasWarning) {
    return 'Warning';
  }

  return 'Pass';
}

function buildInspectionRemarks(stationType, result, reading) {
  if (result === 'Fail') {
    if ((reading.PM25 !== null && reading.PM25 > 100) || stationType === 'Air') {
      return `Critical air-quality breach detected (PM2.5 ${reading.PM25 ?? 'n/a'}). Immediate corrective action required.`;
    }
    if ((reading.water_ph !== null && reading.water_ph < 5) || stationType === 'Water') {
      return `Water discharge is outside safe pH range (${reading.water_ph ?? 'n/a'}). Escalate for treatment review.`;
    }
    return `Excessive industrial noise recorded (${reading.noise_level ?? 'n/a'} dB). Mitigation required.`;
  }

  if (result === 'Warning') {
    if (reading.PM25 !== null && reading.PM25 > 60) {
      return `Air emissions are elevated but below fail threshold (PM2.5 ${reading.PM25}). Monitor closely.`;
    }
    if (reading.water_ph !== null && reading.water_ph < 6.5) {
      return `Water pH is drifting from the preferred range (${reading.water_ph}). Preventive maintenance advised.`;
    }
    if (reading.noise_level !== null && reading.noise_level > 75) {
      return `Noise is trending high (${reading.noise_level} dB). Recommend operational adjustment.`;
    }
  }

  return 'Readings are within acceptable operational limits.';
}

async function getLatestSimulationRun() {
  const [rows] = await db.query(
    `SELECT
       simulation_id AS simulationId,
       status,
       target_count AS target,
       created_count AS created,
       warning_count AS warnings,
       failure_count AS failures,
       delay_ms AS delayMs,
       last_reading_id AS lastReadingId,
       last_inspection_id AS lastInspectionId,
       last_violation_id AS lastViolationId,
       error_message AS error,
       started_at AS startedAt,
       finished_at AS finishedAt
     FROM SimulationRun
     ORDER BY simulation_id DESC
     LIMIT 1`,
  );

  const run = rows[0];
  if (!run) {
    return {
      simulationId: null,
      running: false,
      target: 0,
      created: 0,
      warnings: 0,
      failures: 0,
      delayMs: 1200,
      lastReadingId: null,
      lastInspectionId: null,
      lastViolationId: null,
      error: null,
      startedAt: null,
      finishedAt: null,
    };
  }

  return {
    ...run,
    running: run.status === 'Running',
  };
}

async function createSimulationStep(simulationId) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [runRows] = await connection.query(
      `SELECT
         simulation_id,
         status,
         target_count,
         created_count,
         warning_count,
         failure_count
       FROM SimulationRun
       WHERE simulation_id = ?
       FOR UPDATE`,
      [simulationId],
    );

    const run = runRows[0];
    if (!run) {
      throw new Error('Simulation run not found.');
    }

    if (run.status !== 'Running') {
      await connection.rollback();
      return { completed: true };
    }

    if (run.created_count >= run.target_count) {
      await connection.execute(
        `UPDATE SimulationRun
         SET status = 'Completed', finished_at = CURRENT_TIMESTAMP
         WHERE simulation_id = ?`,
        [simulationId],
      );
      await connection.commit();
      return { completed: true };
    }

    const [stations] = await connection.query(
      `SELECT ms.station_id, ms.station_type, ms.location_id
       FROM MonitoringStation ms`,
    );

    if (stations.length === 0) {
      throw new Error('No monitoring stations available for simulation.');
    }

    const [industries] = await connection.query(
      `SELECT industry_id, industry_name, location_id
       FROM Industry`,
    );

    if (industries.length === 0) {
      throw new Error('No industries available for simulation.');
    }

    const industriesByLocation = new Map();
    for (const industry of industries) {
      if (!industriesByLocation.has(industry.location_id)) {
        industriesByLocation.set(industry.location_id, []);
      }
      industriesByLocation.get(industry.location_id).push(industry);
    }

    const inspectors = [
      'Rajesh Kumar',
      'Meena Sharma',
      'Anil Gupta',
      'Sunita Patel',
      'Kavita Nair',
      'Ravi Menon',
    ];

    const station = pickRandom(stations);
    const locationIndustries = industriesByLocation.get(station.location_id);
    const targetIndustry = pickRandom(locationIndustries && locationIndustries.length > 0 ? locationIndustries : industries);
    const reading = buildReadingPayload(station.station_type);
    const result = evaluateInspectionResult(reading);
    const remarks = buildInspectionRemarks(station.station_type, result, reading);

    const [readingInsert] = await connection.execute(
      `INSERT INTO PollutionReading
        (station_id, reading_datetime, PM25, PM10, NO2, SO2, water_ph, noise_level)
       VALUES (?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        station.station_id,
        reading.PM25,
        reading.PM10,
        reading.NO2,
        reading.SO2,
        reading.water_ph,
        reading.noise_level,
      ],
    );

    const [inspectionInsert] = await connection.execute(
      `INSERT INTO Inspection
        (industry_id, inspection_date, inspector_name, remarks, result)
       VALUES (?, CURDATE(), ?, ?, ?)`,
      [
        targetIndustry.industry_id,
        pickRandom(inspectors),
        remarks,
        result,
      ],
    );

    let violationId = null;

    if (result === 'Fail') {
      let violationType = 'Air';
      let penaltyAmount = 50000;

      if (reading.water_ph !== null && reading.water_ph < 5) {
        violationType = 'Water';
        penaltyAmount = 75000;
      } else if (reading.noise_level !== null && reading.noise_level > 85) {
        violationType = 'Noise';
        penaltyAmount = 30000;
      }

      const [violationInsert] = await connection.execute(
        `INSERT INTO Violation
          (industry_id, reading_id, violation_type, penalty_amount, status)
         VALUES (?, ?, ?, ?, 'Pending')`,
        [
          targetIndustry.industry_id,
          readingInsert.insertId,
          violationType,
          penaltyAmount,
        ],
      );
      violationId = violationInsert.insertId;
    }

    const warningIncrement = result === 'Warning' ? 1 : 0;
    const failureIncrement = result === 'Fail' ? 1 : 0;
    const isCompleted = run.created_count + 1 >= run.target_count;

    await connection.execute(
      `UPDATE SimulationRun
       SET created_count = created_count + 1,
           warning_count = warning_count + ?,
           failure_count = failure_count + ?,
           last_reading_id = ?,
           last_inspection_id = ?,
           last_violation_id = ?,
           status = ?,
           finished_at = CASE WHEN ? = 'Completed' THEN CURRENT_TIMESTAMP ELSE finished_at END
       WHERE simulation_id = ?`,
      [
        warningIncrement,
        failureIncrement,
        readingInsert.insertId,
        inspectionInsert.insertId,
        violationId,
        isCompleted ? 'Completed' : 'Running',
        isCompleted ? 'Completed' : 'Running',
        simulationId,
      ],
    );

    await connection.commit();

    return {
      completed: isCompleted,
    };
  } catch (error) {
    await connection.rollback();
    try {
      await db.execute(
        `UPDATE SimulationRun
         SET status = 'Failed',
             error_message = ?,
             finished_at = CURRENT_TIMESTAMP
         WHERE simulation_id = ?`,
        [error.message, simulationId],
      );
    } catch (updateError) {
      // Keep the original error surface if the failure marker cannot be saved.
    }
    throw error;
  } finally {
    connection.release();
  }
}

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.execute(
      'SELECT user_id, username, full_name, role FROM Users WHERE username = ? AND password = ?',
      [username, password],
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [users] = await db.query(
      'SELECT user_id, username, full_name, role, created_at FROM Users ORDER BY user_id',
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;
    const [result] = await db.execute(
      'INSERT INTO Users (username, password, full_name, role) VALUES (?, ?, ?, ?)',
      [username, password, full_name, role],
    );
    res.json({ success: true, user_id: result.insertId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const [result] = await db.execute('DELETE FROM Users WHERE user_id = ?', [req.params.id]);
    res.json({ success: true, changes: result.affectedRows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tables', async (req, res) => {
  try {
    const tables = await getTableNames();
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tables/:name/schema', async (req, res) => {
  try {
    const tableName = await assertValidTable(req.params.name);
    const schema = await getTableSchema(tableName);
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tables/:name/data', async (req, res) => {
  try {
    const tableName = await assertValidTable(req.params.name);
    const limit = Number.parseInt(req.query.limit, 10) || 100;
    const offset = Number.parseInt(req.query.offset, 10) || 0;
    let rows;

    if (tableName === 'PollutionReading') {
      [rows] = await db.query(
        `SELECT pr.*,
            CASE WHEN v.violation_id IS NULL THEN 0 ELSE 1 END AS has_violation,
            v.violation_type,
            v.status AS violation_status
         FROM PollutionReading pr
         LEFT JOIN Violation v ON v.reading_id = pr.reading_id
         ORDER BY pr.reading_id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );
    } else if (tableName === 'Inspection') {
      [rows] = await db.query(
        `SELECT *
         FROM Inspection
         ORDER BY inspection_id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );
    } else if (tableName === 'Violation') {
      [rows] = await db.query(
        `SELECT *
         FROM Violation
         ORDER BY violation_id DESC
         LIMIT ? OFFSET ?`,
        [limit, offset],
      );
    } else {
      [rows] = await db.query(
        `SELECT * FROM ${quoteId(tableName)} LIMIT ? OFFSET ?`,
        [limit, offset],
      );
    }
    const [totalRows] = await db.query(
      `SELECT COUNT(*) AS count FROM ${quoteId(tableName)}`,
    );
    res.json({ rows, total: totalRows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tables/:name/insert', async (req, res) => {
  try {
    const tableName = await assertValidTable(req.params.name);
    const { columns, values } = req.body;
    const schema = await getTableSchema(tableName);
    const schemaMap = new Map(schema.columns.map((column) => [column.name, column]));

    if (!Array.isArray(columns) || !Array.isArray(values) || columns.length !== values.length) {
      throw new Error('Invalid insert payload.');
    }

    const safeColumns = columns.map((columnName) => {
      if (!isSafeIdentifier(columnName) || !schemaMap.has(columnName)) {
        throw new Error(`Invalid column: ${columnName}`);
      }
      return columnName;
    });

    const placeholders = safeColumns.map(() => '?').join(', ');
    const columnList = safeColumns.map(quoteId).join(', ');
    const normalizedValues = safeColumns.map((columnName, index) =>
      normalizeValueByColumn(schemaMap.get(columnName), values[index]));

    const [result] = await db.execute(
      `INSERT INTO ${quoteId(tableName)} (${columnList}) VALUES (${placeholders})`,
      normalizedValues,
    );
    res.json({ success: true, lastInsertId: result.insertId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/tables/:name/update', async (req, res) => {
  try {
    const tableName = await assertValidTable(req.params.name);
    const { pkColumn, pkValue, column, value } = req.body;
    const schema = await getTableSchema(tableName);
    const schemaMap = new Map(schema.columns.map((item) => [item.name, item]));

    if (!schemaMap.has(pkColumn) || !schemaMap.has(column)) {
      throw new Error('Invalid column selection.');
    }

    const [result] = await db.execute(
      `UPDATE ${quoteId(tableName)}
       SET ${quoteId(column)} = ?
       WHERE ${quoteId(pkColumn)} = ?`,
      [normalizeValueByColumn(schemaMap.get(column), value), pkValue],
    );
    res.json({ success: true, changes: result.affectedRows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/tables/:name/delete', async (req, res) => {
  try {
    const tableName = await assertValidTable(req.params.name);
    const { pkColumn, pkValue } = req.body;
    const schema = await getTableSchema(tableName);
    const schemaMap = new Map(schema.columns.map((item) => [item.name, item]));

    if (!schemaMap.has(pkColumn)) {
      throw new Error('Invalid primary key column.');
    }

    const [result] = await db.execute(
      `DELETE FROM ${quoteId(tableName)} WHERE ${quoteId(pkColumn)} = ?`,
      [pkValue],
    );
    res.json({ success: true, changes: result.affectedRows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/query', async (req, res) => {
  try {
    const { sql } = req.body;
    const trimmed = sql.trim();
    const [rows] = await db.query(trimmed);

    if (Array.isArray(rows)) {
      const resultRows = firstResultSet(rows);
      const columns = resultRows.length > 0 ? Object.keys(resultRows[0]) : [];
      return res.json({
        type: 'select',
        columns,
        rows: resultRows,
        rowCount: resultRows.length,
      });
    }

    const changes = rows.affectedRows ?? 0;
    return res.json({
      type: 'modify',
      message: `Query executed successfully. Changes: ${changes}`,
      changes,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/simulation/start', async (req, res) => {
  try {
    const currentRun = await getLatestSimulationRun();
    if (currentRun.running) {
      return res.status(409).json({
        error: 'Simulation is already running.',
        ...currentRun,
      });
    }

    const requestedCount = Number.parseInt(req.body?.count, 10);
    const count = Number.isFinite(requestedCount)
      ? Math.max(1, Math.min(requestedCount, 100))
      : 20;
    const requestedDelay = Number.parseInt(req.body?.delayMs, 10);
    const delayMs = Number.isFinite(requestedDelay)
      ? Math.max(500, Math.min(requestedDelay, 10000))
      : 1200;

    const [result] = await db.execute(
      `INSERT INTO SimulationRun
        (status, target_count, created_count, warning_count, failure_count, delay_ms)
       VALUES ('Running', ?, 0, 0, 0, ?)`,
      [count, delayMs],
    );

    res.json({
      success: true,
      message: 'Simulation started.',
      simulationId: result.insertId,
      running: true,
      target: count,
      delayMs,
      created: 0,
      warnings: 0,
      failures: 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulation/tick', async (req, res) => {
  try {
    const currentRun = await getLatestSimulationRun();

    if (!currentRun.running || !currentRun.simulationId) {
      return res.json({ success: true, ...(await getLatestSimulationRun()) });
    }

    await createSimulationStep(currentRun.simulationId);
    res.json({ success: true, ...(await getLatestSimulationRun()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/simulation/status', async (req, res) => {
  res.json({ success: true, ...(await getLatestSimulationRun()) });
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const [
      [locations],
      [industries],
      [stations],
      [readings],
      [inspections],
      [violations],
      [pendingViolations],
      [totalPenalties],
      [resolvedViolations],
      [failedInspections],
      [totalUsers],
      [recentInspections],
      [violationsByType],
      [violationsByStatus],
      [topPolluted],
    ] = await Promise.all([
      db.query('SELECT COUNT(*) AS c FROM Location'),
      db.query('SELECT COUNT(*) AS c FROM Industry'),
      db.query('SELECT COUNT(*) AS c FROM MonitoringStation'),
      db.query('SELECT COUNT(*) AS c FROM PollutionReading'),
      db.query('SELECT COUNT(*) AS c FROM Inspection'),
      db.query('SELECT COUNT(*) AS c FROM Violation'),
      db.query("SELECT COUNT(*) AS c FROM Violation WHERE status = 'Pending'"),
      db.query('SELECT COALESCE(SUM(penalty_amount), 0) AS c FROM Violation'),
      db.query("SELECT COUNT(*) AS c FROM Violation WHERE status = 'Resolved'"),
      db.query("SELECT COUNT(*) AS c FROM Inspection WHERE result = 'Fail'"),
      db.query('SELECT COUNT(*) AS c FROM Users'),
      db.query(`
        SELECT ins.inspection_id, ind.industry_name, ins.inspection_date, ins.inspector_name, ins.result
        FROM Inspection ins
        JOIN Industry ind ON ins.industry_id = ind.industry_id
        ORDER BY ins.inspection_date DESC
        LIMIT 5
      `),
      db.query(`
        SELECT violation_type, COUNT(*) AS count, SUM(penalty_amount) AS total_penalty
        FROM Violation
        GROUP BY violation_type
      `),
      db.query(`
        SELECT status, COUNT(*) AS count
        FROM Violation
        GROUP BY status
      `),
      db.query(`
        SELECT l.area_name, l.city, ROUND(AVG(pr.PM25), 2) AS avg_pm25, COUNT(pr.reading_id) AS readings
        FROM PollutionReading pr
        JOIN MonitoringStation ms ON pr.station_id = ms.station_id
        JOIN Location l ON ms.location_id = l.location_id
        WHERE pr.PM25 IS NOT NULL
        GROUP BY l.location_id, l.area_name, l.city
        ORDER BY avg_pm25 DESC
        LIMIT 5
      `),
    ]);

    res.json({
      locations: locations[0].c,
      industries: industries[0].c,
      stations: stations[0].c,
      readings: readings[0].c,
      inspections: inspections[0].c,
      violations: violations[0].c,
      pendingViolations: pendingViolations[0].c,
      totalPenalties: totalPenalties[0].c,
      resolvedViolations: resolvedViolations[0].c,
      failedInspections: failedInspections[0].c,
      totalUsers: totalUsers[0].c,
      recentInspections,
      violationsByType,
      violationsByStatus,
      topPolluted,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    error: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function start() {
  try {
    await getDb();
    console.log(`Database connected to MySQL schema "${DB_CONFIG.database}".`);
    app.listen(PORT, () => {
      console.log(`Pollution Monitoring System running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start application:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = app;
