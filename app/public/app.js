// ============================================================
// Pollution Monitoring System — Frontend Logic
// Admin & User Portals with Three-Tier Architecture
// ============================================================

let currentUser = null;
let currentTable = null;
let currentSchema = null;
let pendingConfirmAction = null;
let currentViewId = null;
let simulationPollTimer = null;
let lastSimulationSnapshot = null;
let simulationMarkers = {
  lastReadingId: null,
  lastInspectionId: null,
  lastViolationId: null,
};
const renderSignatures = {
  userPollution: '',
  userInspections: '',
  userViolations: '',
  adminTable: '',
};

const TABLE_ICONS = {
  Location: '📍', Industry: '🏭', MonitoringStation: '📡',
  PollutionReading: '🌫️', Inspection: '🔍', Violation: '⚠️', Users: '👥',
};

const PRESETS = [
  { label: 'All Industries + Locations', sql: `SELECT i.industry_id, i.industry_name, i.industry_type, i.license_number, l.area_name, l.city\nFROM Industry i\nJOIN Location l ON i.location_id = l.location_id\nORDER BY i.industry_name;` },
  { label: 'Pending Violations', sql: `SELECT v.violation_id, ind.industry_name, v.violation_type, v.penalty_amount, v.status\nFROM Violation v\nJOIN Industry ind ON v.industry_id = ind.industry_id\nWHERE v.status = 'Pending'\nORDER BY v.penalty_amount DESC;` },
  { label: 'Failed Inspections', sql: `SELECT ins.inspection_id, ind.industry_name, ins.inspection_date, ins.inspector_name, ins.remarks\nFROM Inspection ins\nJOIN Industry ind ON ins.industry_id = ind.industry_id\nWHERE ins.result = 'Fail'\nORDER BY ins.inspection_date;` },
  { label: 'Avg PM2.5 by Location', sql: `SELECT l.area_name, l.city,\n  ROUND(AVG(pr.PM25), 2) AS avg_PM25,\n  ROUND(AVG(pr.PM10), 2) AS avg_PM10\nFROM PollutionReading pr\nJOIN MonitoringStation ms ON pr.station_id = ms.station_id\nJOIN Location l ON ms.location_id = l.location_id\nWHERE pr.PM25 IS NOT NULL\nGROUP BY l.location_id\nORDER BY avg_PM25 DESC;` },
  { label: 'Violation Totals per Industry', sql: `SELECT ind.industry_name,\n  COUNT(v.violation_id) AS total_violations,\n  SUM(v.penalty_amount) AS total_penalty\nFROM Industry ind\nJOIN Violation v ON ind.industry_id = v.industry_id\nGROUP BY ind.industry_id\nHAVING COUNT(v.violation_id) > 1\nORDER BY total_penalty DESC;` },
  { label: 'Show All Tables', sql: `SELECT table_name AS name\nFROM information_schema.tables\nWHERE table_schema = DATABASE()\nORDER BY table_name;` },
];

// ─── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupLogin();
  setupNavigation();
  setupConsole();
  setupModal();
  setupConfirmModal();
  setupUserManagement();
  setupSimulation();
  checkSimulationOnLoad();
});

function setupSimulation() {
  const btn = document.getElementById('btn-start-simulation');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Simulating...';

    const res = await fetchJSON('/api/simulation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 60, delayMs: 1000 }),
    });

    btn.disabled = false;
    btn.textContent = prev;

    if (res && res.success) {
      toast(`Simulation started. ${res.target} readings will be inserted live.`, 'success');
      startSimulationPolling();
      loadDashboard();
    } else {
      toast(res?.error || 'Simulation failed', 'error');
    }
  });
}

function startSimulationPolling() {
  if (simulationPollTimer) return;

  simulationPollTimer = setInterval(async () => {
    const res = await fetchJSON('/api/simulation/tick', { method: 'POST' });
    if (!res || res.error) return;

    const wasRunning = Boolean(lastSimulationSnapshot && lastSimulationSnapshot.running);
    const isRunning = Boolean(res.running);
    const progressed = !lastSimulationSnapshot
      || res.created !== lastSimulationSnapshot.created
      || res.lastReadingId !== lastSimulationSnapshot.lastReadingId
      || res.lastInspectionId !== lastSimulationSnapshot.lastInspectionId
      || res.lastViolationId !== lastSimulationSnapshot.lastViolationId;

    simulationMarkers = {
      lastReadingId: res.lastReadingId,
      lastInspectionId: res.lastInspectionId,
      lastViolationId: res.lastViolationId,
    };

    if (progressed || (wasRunning && !isRunning)) {
      refreshActiveSimulationViews();
    }

    if (wasRunning && !isRunning) {
      if (res.error) {
        toast(`Simulation stopped: ${res.error}`, 'error');
      } else {
        toast(`Simulation finished. Added ${res.created} readings and ${res.failures} violations.`, 'success');
      }
      clearInterval(simulationPollTimer);
      simulationPollTimer = null;
    }

    lastSimulationSnapshot = res;
  }, 1500);
}

function refreshActiveSimulationViews() {
  if (currentViewId === 'dashboard') loadDashboard();
  if (currentViewId === 'user-pollution') loadUserPollution();
  if (currentViewId === 'user-inspections') loadUserInspections();
  if (currentViewId === 'user-violations') loadUserViolations();
  if (currentViewId === 'table' && ['PollutionReading', 'Inspection', 'Violation'].includes(currentTable)) {
    loadTable(currentTable, { reuseSchema: true });
  }
}

async function checkSimulationOnLoad() {
  const res = await fetchJSON('/api/simulation/status');
  if (res && !res.error) {
    simulationMarkers = {
      lastReadingId: res.lastReadingId,
      lastInspectionId: res.lastInspectionId,
      lastViolationId: res.lastViolationId,
    };
    lastSimulationSnapshot = res;
    if (res.running) {
      startSimulationPolling();
    }
  }
}

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function setupTheme() {
  const button = document.getElementById('btn-theme');
  const savedTheme = localStorage.getItem('pollution-theme') || 'light';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    if (button) {
      button.textContent = theme === 'dark' ? '☀' : '☾';
      button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
      button.setAttribute('aria-label', button.title);
    }
    localStorage.setItem('pollution-theme', theme);
  }

  applyTheme(savedTheme);
  if (button) {
    button.addEventListener('click', () => {
      const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });
  }
}

function setupConfirmModal() {
  const overlay = document.getElementById('confirm-modal-overlay');
  const closeButtons = [
    document.getElementById('confirm-modal-close'),
    document.getElementById('confirm-modal-cancel'),
  ];

  closeButtons.forEach((button) => {
    button.addEventListener('click', closeConfirmModal);
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeConfirmModal();
  });

  document.getElementById('confirm-modal-ok').addEventListener('click', async () => {
    const action = pendingConfirmAction;
    closeConfirmModal();
    if (action) await action();
  });
}

function openConfirmModal({ title, message, confirmText = 'Delete', onConfirm }) {
  pendingConfirmAction = onConfirm;
  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  document.getElementById('confirm-modal-ok').textContent = confirmText;
  document.getElementById('confirm-modal-overlay').classList.add('open');
}

function closeConfirmModal() {
  pendingConfirmAction = null;
  document.getElementById('confirm-modal-overlay').classList.remove('open');
}

function setupLogin() {
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const res = await fetchJSON('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (res.error) {
      errorEl.textContent = res.error;
      return;
    }

    currentUser = res.user;
    enterApp();
  });

  // Demo credential click-to-fill
  document.querySelectorAll('.hint-item').forEach(el => {
    el.addEventListener('click', () => {
      document.getElementById('login-username').value = el.dataset.user;
      document.getElementById('login-password').value = el.dataset.pass;
    });
  });
}

function enterApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-shell').style.display = 'flex';

  const isAdmin = currentUser.role === 'admin';
  const isInspector = currentUser.role === 'inspector';
  const isTeacher = currentUser.role === 'teacher';

  // Update sidebar
  document.getElementById('portal-label').textContent =
    isAdmin ? 'Admin Portal' : (isTeacher ? 'Teacher Portal' : (isInspector ? 'Inspector Portal' : 'User Portal'));
  document.getElementById('user-name').textContent = currentUser.full_name;
  document.getElementById('user-role-badge').textContent = currentUser.role;
  document.getElementById('user-avatar').textContent = currentUser.full_name.charAt(0).toUpperCase();

  // Color the avatar based on role
  const avatar = document.getElementById('user-avatar');
  if (isAdmin) avatar.style.background = '#6c63ff';
  else if (isTeacher) avatar.style.background = '#0b8fdc';
  else if (isInspector) avatar.style.background = '#60a5fa';
  else avatar.style.background = '#34d399';

  // Show/hide nav sections
  document.getElementById('nav-dashboard').style.display = isTeacher ? 'none' : 'flex';
  document.getElementById('admin-nav').style.display = isAdmin ? 'block' : 'none';
  document.getElementById('user-nav').style.display = (!isAdmin && !isTeacher) ? 'block' : 'none';
  document.getElementById('teacher-nav').style.display = isTeacher ? 'block' : 'none';

  // Role banner on dashboard
  const banner = document.getElementById('role-banner');
  banner.className = 'role-banner';
  if (isAdmin) {
    banner.classList.add('admin-banner');
    banner.innerHTML = '🛡️ <strong>Admin Portal</strong> — Full access to all tables, SQL console, and user management.';
  } else if (isInspector) {
    banner.classList.add('inspector-banner');
    banner.innerHTML = '🔍 <strong>Inspector Portal</strong> — View pollution data, inspections, and violations (read-only).';
  } else if (isTeacher) {
    banner.classList.add('teacher-banner');
    banner.innerHTML = '📘 <strong>Teacher Portal</strong> — Explains schema design, primary keys, foreign keys, and SQL flow.';
  } else {
    banner.classList.add('user-banner');
    banner.innerHTML = '👤 <strong>User Portal</strong> — View environmental monitoring data and reports (read-only).';
  }

  // Load data
  if (isAdmin) loadTableNav();
  if (isTeacher) {
    showView('teacher-guide');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-teacher-guide').classList.add('active');
  } else {
    showView('dashboard');
    loadDashboard();
  }

  // Logout
  document.getElementById('btn-logout').addEventListener('click', () => {
    currentUser = null;
    document.getElementById('app-shell').style.display = 'none';
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('login-password').value = '';
    document.getElementById('login-error').textContent = '';
    // Reset to dashboard view
    showView('dashboard');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById('nav-dashboard').classList.add('active');
  });
}

// ═══════════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════════
function setupNavigation() {
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      showView(view);
      setActiveNav(item);

      // Load data for user portal views
      if (view === 'user-pollution') loadUserPollution();
      if (view === 'user-inspections') loadUserInspections();
      if (view === 'user-violations') loadUserViolations();
      if (view === 'user-industries') loadUserIndustries();
      if (view === 'users') loadUsers();
      if (view === 'dashboard') loadDashboard();
    });
  });
}

function showView(viewId) {
  currentViewId = viewId;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');
}

function setActiveNav(el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
}

// ═══════════════════════════════════════════════════════════
// TABLE NAV (Admin)
// ═══════════════════════════════════════════════════════════
async function loadTableNav() {
  const tables = await fetchJSON('/api/tables');
  const container = document.getElementById('table-nav-list');
  container.innerHTML = '';
  tables.forEach(name => {
    if (name === 'Users') return; // Users managed separately
    const icon = TABLE_ICONS[name] || '📄';
    const el = document.createElement('a');
    el.className = 'nav-item';
    el.dataset.table = name;
    el.innerHTML = `<span class="nav-icon">${icon}</span><span class="nav-text">${name}</span>`;
    el.addEventListener('click', () => {
      showView('table');
      setActiveNav(el);
      loadTable(name);
    });
    container.appendChild(el);
  });
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════
async function loadDashboard() {
  const data = await fetchJSON('/api/dashboard');
  if (!data || data.error) return;

  const grid = document.getElementById('stats-grid');
  const isAdmin = currentUser && currentUser.role === 'admin';

  let cards = [
    { label: 'Industries', value: data.industries, color: 'blue' },
    { label: 'Monitoring Stations', value: data.stations, color: 'green' },
    { label: 'Pollution Readings', value: data.readings, color: 'yellow' },
    { label: 'Total Inspections', value: data.inspections, color: 'accent' },
    { label: 'Failed Inspections', value: data.failedInspections, color: 'red' },
    { label: 'Total Violations', value: data.violations, color: 'orange' },
    { label: 'Pending Violations', value: data.pendingViolations, color: 'red' },
    { label: 'Resolved Violations', value: data.resolvedViolations, color: 'green' },
    { label: 'Total Penalties', value: `₹${Number(data.totalPenalties).toLocaleString('en-IN')}`, color: 'yellow' },
  ];

  if (isAdmin) {
    cards.unshift({ label: 'Locations', value: data.locations, color: 'accent' });
    cards.push({ label: 'Registered Users', value: data.totalUsers, color: 'blue' });
  }

  grid.innerHTML = cards.map(c => `
    <div class="stat-card">
      <div class="stat-label">${c.label}</div>
      <div class="stat-value ${c.color}">${c.value}</div>
    </div>
  `).join('');

  // Top polluted
  const polluted = document.getElementById('top-polluted');
  if (data.topPolluted.length > 0) {
    const maxPM = Math.max(...data.topPolluted.map(p => p.avg_pm25));
    polluted.innerHTML = `<div class="bar-chart">${data.topPolluted.map(p => `
      <div class="bar-row">
        <span class="bar-label">${p.city}</span>
        <div class="bar-track"><div class="bar-fill air" style="width:${(p.avg_pm25 / maxPM * 100)}%">${p.avg_pm25}</div></div>
      </div>`).join('')}</div>`;
  } else {
    polluted.innerHTML = '<div class="result-placeholder">No PM2.5 data</div>';
  }

  // Violations by type
  const byType = document.getElementById('violations-by-type');
  if (data.violationsByType.length > 0) {
    const maxV = Math.max(...data.violationsByType.map(v => v.count));
    byType.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">By Type</div>
      <div class="bar-chart">${data.violationsByType.map(v => `
      <div class="bar-row">
        <span class="bar-label">${v.violation_type}</span>
        <div class="bar-track"><div class="bar-fill ${v.violation_type.toLowerCase()}" style="width:${(v.count / maxV * 100)}%">${v.count} (₹${Number(v.total_penalty).toLocaleString('en-IN')})</div></div>
      </div>`).join('')}</div>`;
  }

  // Violations by status
  const byStatus = document.getElementById('violations-by-status');
  if (data.violationsByStatus.length > 0) {
    const maxS = Math.max(...data.violationsByStatus.map(v => v.count));
    byStatus.innerHTML = `<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">By Status</div>
      <div class="bar-chart">${data.violationsByStatus.map(v => `
      <div class="bar-row">
        <span class="bar-label">${v.status}</span>
        <div class="bar-track"><div class="bar-fill ${v.status.toLowerCase()}" style="width:${(v.count / maxS * 100)}%">${v.count}</div></div>
      </div>`).join('')}</div>`;
  }

  // Recent inspections
  const inspDiv = document.getElementById('recent-inspections');
  if (data.recentInspections.length > 0) {
    inspDiv.innerHTML = `<div class="inspection-list">${data.recentInspections.map(ins => `
      <div class="inspection-row">
        <div class="inspection-info">
          <div class="inspection-name">${ins.industry_name}</div>
          <div class="inspection-meta">${ins.inspection_date} · ${ins.inspector_name}</div>
        </div>
        <span class="badge badge-${ins.result.toLowerCase()}">${ins.result}</span>
      </div>`).join('')}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════
// USER PORTAL — Read-Only Views
// ═══════════════════════════════════════════════════════════
async function loadUserPollution() {
  const res = await fetchJSON('/api/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `
      SELECT pr.reading_id, ms.station_id, ms.station_type, CONCAT(l.area_name, ', ', l.city) AS location,
        pr.reading_datetime, pr.PM25, pr.PM10, pr.NO2, pr.SO2, pr.water_ph, pr.noise_level,
        MAX(CASE WHEN v.violation_id IS NULL THEN 0 ELSE 1 END) AS has_violation,
        MAX(v.violation_type) AS violation_type
      FROM PollutionReading pr
      JOIN MonitoringStation ms ON pr.station_id = ms.station_id
      JOIN Location l ON ms.location_id = l.location_id
      LEFT JOIN Violation v ON v.reading_id = pr.reading_id
      GROUP BY pr.reading_id, ms.station_id, ms.station_type, l.area_name, l.city,
        pr.reading_datetime, pr.PM25, pr.PM10, pr.NO2, pr.SO2, pr.water_ph, pr.noise_level
      ORDER BY pr.reading_id DESC
    `})
  });
  const tbody = document.getElementById('user-pollution-body');
  if (res.rows) {
    const signature = res.rows.slice(0, 12).map(r => `${r.reading_id}:${r.has_violation}`).join('|');
    if (signature === renderSignatures.userPollution) return;
    renderSignatures.userPollution = signature;
    tbody.innerHTML = res.rows.map(r => {
      const severity = getSeverity(r.PM25);
      const hasViolation = Number(r.has_violation) === 1;
      const rowClass = [
        hasViolation ? 'row-violation' : '',
        Number(r.reading_id) === Number(simulationMarkers.lastReadingId) ? 'row-new' : '',
      ].filter(Boolean).join(' ');
      return `<tr class="${rowClass}">
        <td>${r.reading_id}</td><td>${r.station_id}</td><td>${r.station_type}</td>
        <td>${r.location}</td><td>${r.reading_datetime}</td>
        <td>${fmtVal(r.PM25)}</td><td>${fmtVal(r.PM10)}</td><td>${fmtVal(r.NO2)}</td><td>${fmtVal(r.SO2)}</td>
        <td>${fmtVal(r.water_ph)}</td><td>${fmtVal(r.noise_level)}</td>
        <td><span class="badge ${severity.cls}">${severity.label}</span></td>
        <td>${hasViolation ? `<span class="badge badge-fail">${esc(r.violation_type || 'Violation')}</span>` : '<span class="cell-null">-</span>'}</td>
      </tr>`;
    }).join('');
  }
}

async function loadUserInspections() {
  const res = await fetchJSON('/api/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `
      SELECT ins.inspection_id, ind.industry_name, ins.inspection_date,
        ins.inspector_name, ins.remarks, ins.result
      FROM Inspection ins JOIN Industry ind ON ins.industry_id = ind.industry_id
      ORDER BY ins.inspection_date DESC
    `})
  });
  const tbody = document.getElementById('user-inspections-body');
  if (res.rows) {
    const signature = res.rows.slice(0, 12).map(r => `${r.inspection_id}:${r.result}`).join('|');
    if (signature === renderSignatures.userInspections) return;
    renderSignatures.userInspections = signature;
    tbody.innerHTML = res.rows.map(r => {
      const isWarning = String(r.result).toLowerCase() === 'warning';
      const isFail = String(r.result).toLowerCase() === 'fail';
      const trClass = [
        isFail ? 'row-violation' : (isWarning ? 'row-warning' : ''),
        Number(r.inspection_id) === Number(simulationMarkers.lastInspectionId) ? 'row-new' : '',
      ].filter(Boolean).join(' ');
      return `<tr class="${trClass}">
        <td>${r.inspection_id}</td><td>${r.industry_name}</td><td>${r.inspection_date}</td>
        <td>${r.inspector_name}</td><td title="${esc(r.remarks)}">${esc(r.remarks)}</td>
        <td><span class="badge badge-${r.result.toLowerCase()}">${r.result}</span></td>
      </tr>`;
    }).join('');
  }
}

async function loadUserViolations() {
  const res = await fetchJSON('/api/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `
      SELECT v.violation_id, ind.industry_name, v.reading_id, pr.station_id,
        v.violation_type, v.penalty_amount, v.status
      FROM Violation v
      JOIN Industry ind ON v.industry_id = ind.industry_id
      LEFT JOIN PollutionReading pr ON v.reading_id = pr.reading_id
      ORDER BY v.violation_id DESC
    `})
  });
  const tbody = document.getElementById('user-violations-body');
  if (res.rows) {
    const canManage = currentUser && currentUser.role === 'inspector';
    const signature = `${canManage ? 'inspector' : 'viewer'}:${res.rows.slice(0, 12).map(r => `${r.violation_id}:${r.status}`).join('|')}`;
    if (signature === renderSignatures.userViolations) return;
    renderSignatures.userViolations = signature;
    const headRow = document.querySelector('#view-user-violations thead tr');
    if (headRow) {
      headRow.innerHTML = canManage
        ? '<th>ID</th><th>Reading ID</th><th>Station ID</th><th>Industry</th><th>Type</th><th>Penalty (INR)</th><th>Status</th><th>Actions</th>'
        : '<th>ID</th><th>Reading ID</th><th>Station ID</th><th>Industry</th><th>Type</th><th>Penalty (INR)</th><th>Status</th>';
    }
    tbody.innerHTML = res.rows.map(r => `<tr class="${Number(r.violation_id) === Number(simulationMarkers.lastViolationId) ? 'row-new row-violation' : ''}">
      <td>${r.violation_id}</td><td>${r.reading_id}</td><td>${r.station_id}</td><td>${r.industry_name}</td><td>${r.violation_type}</td>
      <td>₹${Number(r.penalty_amount).toLocaleString('en-IN')}</td>
      <td><span class="badge badge-${r.status.toLowerCase()}">${r.status}</span></td>
      ${canManage ? `<td class="cell-actions">${renderViolationActionButtons(r)}</td>` : ''}
    </tr>`).join('');
  }
}

async function loadUserIndustries() {
  const res = await fetchJSON('/api/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sql: `
      SELECT i.industry_id, i.industry_name, i.industry_type, i.license_number,
        l.area_name, l.city
      FROM Industry i JOIN Location l ON i.location_id = l.location_id
      ORDER BY i.industry_name
    `})
  });
  const tbody = document.getElementById('user-industries-body');
  if (res.rows) {
    tbody.innerHTML = res.rows.map(r => `<tr>
      <td>${r.industry_id}</td><td>${r.industry_name}</td><td>${r.industry_type}</td>
      <td>${r.license_number}</td><td>${r.area_name}</td><td>${r.city}</td>
    </tr>`).join('');
  }
}

// ═══════════════════════════════════════════════════════════
// USER MANAGEMENT (Admin)
// ═══════════════════════════════════════════════════════════
function setupUserManagement() {
  document.getElementById('btn-add-user').addEventListener('click', () => {
    document.getElementById('user-modal-overlay').classList.add('open');
  });
  document.getElementById('user-modal-close').addEventListener('click', () => {
    document.getElementById('user-modal-overlay').classList.remove('open');
  });
  document.getElementById('user-modal-cancel').addEventListener('click', () => {
    document.getElementById('user-modal-overlay').classList.remove('open');
  });
  document.getElementById('user-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'user-modal-overlay') {
      document.getElementById('user-modal-overlay').classList.remove('open');
    }
  });
  document.getElementById('user-modal-submit').addEventListener('click', async () => {
    const form = document.getElementById('user-form');
    const data = {
      username: form.querySelector('[name="username"]').value.trim(),
      password: form.querySelector('[name="password"]').value,
      full_name: form.querySelector('[name="full_name"]').value.trim(),
      role: form.querySelector('[name="role"]').value,
    };
    if (!data.username || !data.password || !data.full_name || !data.role) {
      toast('Please fill all fields', 'error');
      return;
    }
    const res = await fetchJSON('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.success) {
      toast('User created successfully', 'success');
      document.getElementById('user-modal-overlay').classList.remove('open');
      form.reset();
      loadUsers();
    } else {
      toast(res.error || 'Failed to create user', 'error');
    }
  });
}

async function loadUsers() {
  const users = await fetchJSON('/api/users');
  const tbody = document.getElementById('users-table-body');
  if (Array.isArray(users)) {
    tbody.innerHTML = users.map(u => `<tr>
      <td>${u.user_id}</td>
      <td>${esc(u.username)}</td>
      <td>${esc(u.full_name)}</td>
      <td><span class="hint-role ${u.role}" style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:10px;text-transform:uppercase">${u.role}</span></td>
      <td>${u.created_at}</td>
      <td class="cell-actions">
        ${u.user_id !== currentUser.user_id ? `<button title="Delete" onclick="deleteUser(${u.user_id})">🗑️</button>` : '<span style="color:var(--text-muted);font-size:11px">You</span>'}
      </td>
    </tr>`).join('');
  }
}

async function deleteUser(id) {
  openConfirmModal({
    title: 'Delete User',
    message: 'Delete this user account? This action cannot be undone.',
    confirmText: 'Delete User',
    onConfirm: async () => {
      const res = await fetchJSON(`/api/users/${id}`, { method: 'DELETE' });
      if (res.success) {
        toast('User deleted', 'success');
        loadUsers();
      } else {
        toast(res.error || 'Delete failed', 'error');
      }
    },
  });
}

// ═══════════════════════════════════════════════════════════
// TABLE VIEW (Admin — CRUD)
// ═══════════════════════════════════════════════════════════
async function loadTable(name, options = {}) {
  const { reuseSchema = false } = options;
  currentTable = name;
  if (reuseSchema && currentSchema) {
    const dataRes = await fetchJSON(`/api/tables/${name}/data`);
    renderTable(currentSchema, dataRes);
    return;
  }
  document.getElementById('table-view-title').textContent = `${TABLE_ICONS[name] || '📄'} ${name}`;
  const [schemaRes, dataRes] = await Promise.all([
    fetchJSON(`/api/tables/${name}/schema`),
    fetchJSON(`/api/tables/${name}/data`),
  ]);
  currentSchema = schemaRes;
  renderSignatures.adminTable = '';
  renderTable(schemaRes, dataRes);
}

function renderTable(schema, data) {
  const thead = document.getElementById('data-table-head');
  const tbody = document.getElementById('data-table-body');
  const footer = document.getElementById('table-footer');
  const cols = schema.columns;
  const pkCol = cols.find(c => Number(c.pk) === 1);

  thead.innerHTML = `<tr>${cols.map(c => `<th>${c.name}${Number(c.pk) === 1 ? ' 🔑' : ''}</th>`).join('')}<th>Actions</th></tr>`;

  if (data.rows.length === 0) {
    renderSignatures.adminTable = 'empty';
    tbody.innerHTML = `<tr><td colspan="${cols.length + 1}" style="text-align:center;padding:40px;color:var(--text-muted)">No data</td></tr>`;
  } else {
    const signature = `${currentTable}:${data.rows.slice(0, 12).map(row => JSON.stringify([row[cols[0].name], row.result, row.has_violation])).join('|')}`;
    if (signature === renderSignatures.adminTable) return;
    renderSignatures.adminTable = signature;
    tbody.innerHTML = data.rows.map(row => `<tr class="${[getAdminRowClass(row), getAdminNewRowClass(row)].filter(Boolean).join(' ')}">
      ${cols.map(c => {
      const val = row[c.name];
      if (val === null || val === undefined) return '<td class="cell-null">NULL</td>';
      return `<td title="${String(val)}">${String(val)}</td>`;
    }).join('')}
      <td class="cell-actions">
        ${pkCol ? `<button title="Delete" onclick="deleteRow('${currentTable}','${pkCol.name}',${typeof row[pkCol.name] === 'string' ? `'${row[pkCol.name]}'` : row[pkCol.name]})">🗑️</button>` : ''}
      </td>
    </tr>`).join('');
  }
  footer.innerHTML = `Showing ${data.rows.length} of ${data.total} rows`;
}

function getAdminRowClass(row) {
  if (currentTable === 'PollutionReading' && Number(row.has_violation) === 1) {
    return 'row-violation';
  }

  if (currentTable === 'Inspection') {
    const result = String(row.result || '').toLowerCase();
    if (result === 'fail') return 'row-violation';
    if (result === 'warning') return 'row-warning';
  }

  return '';
}

function getAdminNewRowClass(row) {
  if (currentTable === 'PollutionReading' && Number(row.reading_id) === Number(simulationMarkers.lastReadingId)) {
    return 'row-new';
  }

  if (currentTable === 'Inspection' && Number(row.inspection_id) === Number(simulationMarkers.lastInspectionId)) {
    return 'row-new';
  }

  if (currentTable === 'Violation' && Number(row.violation_id) === Number(simulationMarkers.lastViolationId)) {
    return 'row-new';
  }

  return '';
}

async function deleteRow(table, pkCol, pkVal) {
  openConfirmModal({
    title: 'Delete Row',
    message: `Delete from ${table} where ${pkCol} = ${pkVal}? This may also remove dependent rows because of foreign key cascade rules.`,
    confirmText: 'Delete Row',
    onConfirm: async () => {
      const res = await fetchJSON(`/api/tables/${table}/delete`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pkColumn: pkCol, pkValue: pkVal }),
      });
      if (res.success) { toast('Row deleted', 'success'); loadTable(table); loadDashboard(); }
      else toast(res.error || 'Delete failed', 'error');
    },
  });
}

// ─── Insert Modal ───────────────────────────────────────────
function setupModal() {
  const overlay = document.getElementById('modal-overlay');
  document.getElementById('btn-add-row').addEventListener('click', () => openInsertModal());
  document.getElementById('modal-close').addEventListener('click', () => closeModal());
  document.getElementById('modal-cancel').addEventListener('click', () => closeModal());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('modal-submit').addEventListener('click', () => submitInsert());
  document.getElementById('btn-refresh-table').addEventListener('click', () => { if (currentTable) loadTable(currentTable); });
}

function openInsertModal() {
  if (!currentSchema || !currentTable) return;
  document.getElementById('modal-title').textContent = `Add to ${currentTable}`;
  const form = document.getElementById('insert-form');
  const cols = currentSchema.columns.filter(c => Number(c.pk) !== 1 && c.extra !== 'auto_increment');
  form.innerHTML = cols.map(c => {
    let inputHtml = '';
    const required = c.notnull ? 'required' : '';
    const placeholder = c.notnull ? 'Required' : 'Optional (NULL)';
    if (c.name === 'station_type') {
      inputHtml = `<select name="${c.name}" ${required}><option value="">Select...</option><option>Air</option><option>Water</option><option>Noise</option><option>Combined</option></select>`;
    } else if (c.name === 'result') {
      inputHtml = `<select name="${c.name}" ${required}><option value="">Select...</option><option>Pass</option><option>Fail</option><option>Warning</option></select>`;
    } else if (c.name === 'violation_type') {
      inputHtml = `<select name="${c.name}" ${required}><option value="">Select...</option><option>Air</option><option>Water</option><option>Noise</option></select>`;
    } else if (c.name === 'status') {
      inputHtml = `<select name="${c.name}" ${required}><option value="">Select...</option><option>Pending</option><option>Resolved</option><option>Appealed</option></select>`;
    } else if (c.name === 'role') {
      inputHtml = `<select name="${c.name}" ${required}><option value="">Select...</option><option>admin</option><option>inspector</option><option>teacher</option><option>user</option></select>`;
    } else {
      const type = c.type.toLowerCase().includes('int')
        ? 'number'
        : (c.name.includes('datetime') ? 'datetime-local' : (c.name.includes('date') ? 'date' : 'text'));
      inputHtml = `<input type="${type}" name="${c.name}" placeholder="${placeholder}" ${required} />`;
    }
    return `<div class="form-group"><label>${c.name} <span style="color:var(--text-muted);font-weight:400;text-transform:none">(${c.type}${c.notnull ? ', NOT NULL' : ''})</span></label>${inputHtml}</div>`;
  }).join('');
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

async function submitInsert() {
  const form = document.getElementById('insert-form');
  const cols = currentSchema.columns.filter(c => Number(c.pk) !== 1 && c.extra !== 'auto_increment');
  const columns = [], values = [];
  cols.forEach(c => {
    const input = form.querySelector(`[name="${c.name}"]`);
    if (input) { columns.push(c.name); values.push(input.value); }
  });
  const res = await fetchJSON(`/api/tables/${currentTable}/insert`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ columns, values }),
  });
  if (res.success) { toast(`Row inserted (ID: ${res.lastInsertId})`, 'success'); closeModal(); loadTable(currentTable); loadDashboard(); }
  else toast(res.error || 'Insert failed', 'error');
}

// ═══════════════════════════════════════════════════════════
// SQL CONSOLE (Admin)
// ═══════════════════════════════════════════════════════════
function setupConsole() {
  const input = document.getElementById('sql-input');
  document.getElementById('btn-run-sql').addEventListener('click', () => runSQL());
  document.getElementById('btn-clear-sql').addEventListener('click', () => { input.value = ''; input.focus(); });
  input.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runSQL(); } });

  const chipsContainer = document.getElementById('preset-chips');
  chipsContainer.innerHTML = PRESETS.map((p, i) => `<span class="preset-chip" data-idx="${i}">${p.label}</span>`).join('');
  chipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    input.value = PRESETS[parseInt(chip.dataset.idx)].sql;
    runSQL();
  });
}

async function runSQL() {
  const sql = document.getElementById('sql-input').value.trim();
  if (!sql) return;
  const resultDiv = document.getElementById('console-result');
  resultDiv.innerHTML = '<div class="result-placeholder">Running...</div>';
  const res = await fetchJSON('/api/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (res.error) { resultDiv.innerHTML = `<div class="result-error">❌ ${esc(res.error)}</div>`; return; }
  if (res.type === 'modify') { resultDiv.innerHTML = `<div class="result-message">✓ ${esc(res.message)}</div>`; loadDashboard(); return; }
  if (res.rows.length === 0) { resultDiv.innerHTML = '<div class="result-placeholder">Query returned 0 rows</div>'; return; }
  const cols = res.columns;
  resultDiv.innerHTML = `
    <div class="table-container" style="border:none;border-radius:0">
      <table class="data-table">
        <thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
        <tbody>${res.rows.map(row => `<tr>${cols.map(c => {
    const v = row[c];
    if (v === null || v === undefined) return '<td class="cell-null">NULL</td>';
    return `<td>${esc(String(v))}</td>`;
  }).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="result-meta">${res.rowCount} row${res.rowCount !== 1 ? 's' : ''} returned</div>`;
}

function renderViolationActionButtons(row) {
  const statuses = ['Pending', 'Resolved', 'Appealed'];
  return statuses.map((status) => {
    const isCurrent = row.status === status;
    return `<button type="button" class="status-btn ${isCurrent ? 'active' : ''}" ${isCurrent ? 'disabled' : ''} onclick="updateViolationStatus(${row.violation_id}, '${status}')">${status}</button>`;
  }).join('');
}

async function updateViolationStatus(id, status) {
  const res = await fetchJSON(`/api/violations/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });

  if (res.success) {
    toast(`Violation ${id} marked ${status}.`, 'success');
    renderSignatures.userViolations = '';
    loadUserViolations();
    loadDashboard();
    return;
  }

  toast(res.error || 'Failed to update violation status.', 'error');
}

// ═══════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════
async function fetchJSON(url, opts = {}) {
  try {
    const res = await fetch(url, opts);
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      return await res.json();
    }

    const body = await res.text();
    const compactBody = body.replace(/\s+/g, ' ').trim();
    const isHtml = compactBody.startsWith('<!DOCTYPE') || compactBody.startsWith('<html') || compactBody.startsWith('<');
    const message = isHtml
      ? `Server returned HTML for ${url}. Check Vercel routing and API deployment.`
      : `Unexpected response from ${url}: ${compactBody.slice(0, 120)}`;

    throw new Error(message);
  } catch (err) {
    toast(err.message, 'error');
    return { error: err.message };
  }
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function fmtVal(v) {
  return (v === null || v === undefined) ? '<span class="cell-null">—</span>' : v;
}

function getSeverity(pm25) {
  if (pm25 === null || pm25 === undefined) return { label: 'N/A', cls: '' };
  if (pm25 <= 30) return { label: 'Good', cls: 'badge-pass' };
  if (pm25 <= 60) return { label: 'Moderate', cls: 'badge-warning' };
  if (pm25 <= 90) return { label: 'Unhealthy', cls: 'badge-fail' };
  if (pm25 <= 120) return { label: 'Very Unhealthy', cls: 'badge-fail' };
  return { label: 'Hazardous', cls: 'badge-fail' };
}

function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
