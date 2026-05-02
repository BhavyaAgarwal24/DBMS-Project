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
    const [rows] = await db.query(
      `SELECT * FROM ${quoteId(tableName)} LIMIT ? OFFSET ?`,
      [limit, offset],
    );
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
