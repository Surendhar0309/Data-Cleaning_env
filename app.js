/* ═══════════════════════════════════════════════════════
   Data Cleaning Environment — app.js
   All event listeners wired in JS — no inline onclick
   ═══════════════════════════════════════════════════════ */

let API = 'http://localhost:7860';

/* ── App state ───────────────────────────────────────────── */
const state = {
  task: 'easy_sales_cleaning',
  target: 0.85,
  running: false,
  stepNum: 0,
  cumReward: 0,
  obs: null,
  log: [],
  loading: false,
};

let csvData = [];
let csvHeaders = [];

/* ── Helpers ─────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const show = id => { const el = $(id); if (el) el.style.display = ''; };
const hide = id => { const el = $(id); if (el) el.style.display = 'none'; };
const showFlex = id => { const el = $(id); if (el) el.style.display = 'flex'; };

/* ══════════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════════ */

function switchTab(tab) {
  // panels
  const envPanel    = $('panelEnv');
  const uploadPanel = $('panelUpload');
  if (envPanel)    envPanel.style.display    = tab === 'env'    ? '' : 'none';
  if (uploadPanel) uploadPanel.style.display = tab === 'upload' ? '' : 'none';

  // tab buttons
  const tabEnv    = $('tabEnv');
  const tabUpload = $('tabUpload');
  if (tabEnv) {
    tabEnv.classList.toggle('nav-active', tab === 'env');
  }
  if (tabUpload) {
    tabUpload.classList.toggle('nav-active', tab === 'upload');
  }
}

/* ══════════════════════════════════════════════════════════
   SERVER CONNECTION
══════════════════════════════════════════════════════════ */

function reconnect() {
  const input = $('serverUrl');
  if (input) {
    API = (input.value || 'http://localhost:7860').trim().replace(/\/$/, '');
  }
  checkServer();
}

async function checkServer() {
  setStatus('connecting', 'connecting...');
  try {
    const r = await fetch(`${API}/`, {
      signal: AbortSignal.timeout(5000),
    });
    if (r.ok) {
      setStatus('online', 'server online');
      hideError();
      return true;
    }
  } catch (e) {
    // fall through
  }
  setStatus('offline', 'server offline');
  return false;
}

function setStatus(s, label) {
  const dot = $('statusDot');
  const lbl = $('statusLabel');
  if (dot) {
    dot.className = `status-dot status-${s}`;
  }
  if (lbl) lbl.textContent = label;
}

function showError(msg) {
  const banner = $('errorBanner');
  const msgEl  = $('errorMsg');
  if (banner) banner.style.display = 'flex';
  if (msgEl)  msgEl.textContent = msg;
}

function hideError() {
  const banner = $('errorBanner');
  if (banner) banner.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════
   TASK SELECTION
══════════════════════════════════════════════════════════ */

const DIFF_COLORS = { easy: '#4ade80', medium: '#fbbf24', hard: '#f87171' };

function selectTask(card) {
  // deactivate all
  document.querySelectorAll('.task-card').forEach(c => {
    c.classList.remove('task-active');
    const bar = c.querySelector('.task-bar');
    if (bar) bar.style.background = 'transparent';
  });

  // activate clicked
  card.classList.add('task-active');
  const bar = card.querySelector('.task-bar');
  if (bar) bar.style.background = DIFF_COLORS[card.dataset.difficulty] || '#4ade80';

  // update state
  state.task   = card.dataset.task;
  state.target = parseFloat(card.dataset.target);
  resetEpisodeState();
}

function resetEpisodeState() {
  state.running   = false;
  state.stepNum   = 0;
  state.cumReward = 0;
  state.obs       = null;
  state.log       = [];

  renderMetrics();
  renderLog();
  hide('colStatusCard');
  hide('gradeBox');

  const btnReset = $('btnReset');
  const btnStep  = $('btnStep');
  if (btnReset) btnReset.textContent = 'Start Episode';
  if (btnStep)  btnStep.disabled = true;

  // update target marker
  const pct = state.target * 100;
  const marker = $('targetMarker');
  const label  = $('targetLabel');
  const qval   = $('qualityValue');
  const qfill  = $('qualityFill');
  if (marker) marker.style.left = pct + '%';
  if (label)  label.textContent = `target ${pct.toFixed(0)}%`;
  if (qval)   qval.textContent  = '—';
  if (qfill)  qfill.style.width = '0%';
}

/* ══════════════════════════════════════════════════════════
   ACTION COMPOSER CONTROLS
══════════════════════════════════════════════════════════ */

const METHODS = {
  handle_missing: ['mean', 'median', 'delete', 'forward_fill'],
  standardize:    ['lowercase', 'uppercase', 'title_case', 'minmax', 'zscore'],
  detect_anomaly: [],
  validate:       [],
  aggregate:      [],
};

function updateActionControls() {
  const type    = $('actionType') ? $('actionType').value : 'handle_missing';
  const methods = METHODS[type] || [];
  const mg      = $('methodGroup');
  const tg      = $('thresholdGroup');
  const msel    = $('method');

  if (mg) mg.style.display = methods.length ? '' : 'none';
  if (tg) tg.style.display = type === 'detect_anomaly' ? '' : 'none';
  if (msel && methods.length) {
    msel.innerHTML = methods.map(m => `<option value="${m}">${m}</option>`).join('');
  }
}

/* ══════════════════════════════════════════════════════════
   EPISODE: RESET
══════════════════════════════════════════════════════════ */

async function handleReset() {
  if (state.loading) return;
  state.loading = true;
  setLoading(true);
  hideError();
  hide('gradeBox');

  const online = await checkServer();
  if (!online) {
    showError(`Cannot reach ${API} — update the SERVER URL and click Connect.`);
    state.loading = false;
    setLoading(false);
    return;
  }

  try {
    const res = await fetch(`${API}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    state.obs       = data.observation;
    state.running   = true;
    state.stepNum   = 0;
    state.cumReward = 0;
    state.log       = [];

    renderMetrics();
    renderQuality(data.observation);
    renderColStatus(data.observation);
    renderLog();
    updateSuggestions(data.observation);

    const btnReset = $('btnReset');
    const btnStep  = $('btnStep');
    if (btnReset) btnReset.textContent = 'Reset';
    if (btnStep)  btnStep.disabled = false;

  } catch (e) {
    showError(`Reset failed: ${e.message}`);
  }

  state.loading = false;
  setLoading(false);
}

/* ══════════════════════════════════════════════════════════
   EPISODE: STEP
══════════════════════════════════════════════════════════ */

async function handleStep() {
  if (!state.running || state.loading) return;
  state.loading = true;
  setLoading(true);

  const actionType = $('actionType') ? $('actionType').value : 'handle_missing';
  const colRaw     = $('columnName') ? $('columnName').value.trim() : '';
  const colName    = colRaw || state.obs?.missing_columns?.[0] || 'amount';

  const action = { action_type: actionType, column_name: colName };
  if (METHODS[actionType]?.length) {
    action.method = $('method') ? $('method').value : 'mean';
  }
  if (actionType === 'detect_anomaly') {
    action.threshold = parseFloat($('threshold') ? $('threshold').value : 2.5);
  }

  try {
    const res = await fetch(`${API}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, action }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const reward = data.reward?.immediate_reward ?? 0;
    state.stepNum++;
    state.cumReward = +(state.cumReward + reward).toFixed(4);
    state.obs = data.observation;

    state.log.push({
      step:        state.stepNum,
      action_type: action.action_type,
      column:      action.column_name,
      method:      action.method || null,
      reward,
      result:      data.observation?.last_action_result || '',
    });

    renderMetrics();
    renderQuality(data.observation);
    renderColStatus(data.observation);
    renderLog();
    updateSuggestions(data.observation);

    if (data.done) {
      state.running = false;
      const btnStep = $('btnStep');
      if (btnStep) btnStep.disabled = true;
      await handleGrade();
    }

  } catch (e) {
    showError(`Step failed: ${e.message}`);
  }

  state.loading = false;
  setLoading(false);
}

/* ══════════════════════════════════════════════════════════
   EPISODE: GRADE
══════════════════════════════════════════════════════════ */

async function handleGrade() {
  try {
    const res = await fetch(`${API}/grader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, episode_data: {} }),
    });
    const data = await res.json();
    renderGrade(data);
  } catch (e) {
    console.error('Grade error:', e);
  }
}

/* ══════════════════════════════════════════════════════════
   RENDERERS
══════════════════════════════════════════════════════════ */

function renderMetrics() {
  const s = $('metricSteps');
  const r = $('metricReward');
  const c = $('metricComplete');
  if (s) s.textContent = state.stepNum;
  if (r) r.textContent = state.cumReward.toFixed(2);
  if (c) c.textContent = `${(state.obs?.completion_percentage || 0).toFixed(0)}%`;
}

function renderQuality(obs) {
  if (!obs) return;
  const pct  = Math.min(100, (obs.data_quality_score || 0) * 100);
  const tpct = state.target * 100;

  const val    = $('qualityValue');
  const fill   = $('qualityFill');
  const marker = $('targetMarker');
  const label  = $('targetLabel');

  if (val)    { val.textContent = pct.toFixed(1) + '%'; val.style.color = pct >= tpct ? '#4ade80' : '#fbbf24'; }
  if (fill)   { fill.style.width = pct + '%'; fill.className = `quality-bar-fill ${pct >= tpct ? 'good' : 'warn'}`; }
  if (marker) marker.style.left = tpct + '%';
  if (label)  label.textContent = `target ${tpct.toFixed(0)}%`;
}

function renderColStatus(obs) {
  if (!obs) return;
  const card = $('colStatusCard');
  if (card) card.style.display = '';

  const renderGroup = (elId, cols, cls, label) => {
    const el = $(elId);
    if (!el) return;
    if (!cols?.length) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="col-group">
        <span class="col-group-label">${label}</span>
        <div>${cols.map(c => `<span class="${cls}">${c}</span>`).join('')}</div>
      </div>`;
  };

  renderGroup('missingCols',      obs.missing_columns,      'tag-missing',      'MISSING');
  renderGroup('anomalyCols',      obs.anomaly_columns,       'tag-anomaly',      'ANOMALIES');
  renderGroup('standardizedCols', obs.standardized_columns,  'tag-standardized', 'STANDARDIZED');

  const la = $('lastAction');
  if (la) {
    if (obs.last_action_result) {
      la.textContent = obs.last_action_result;
      la.style.display = '';
    } else {
      la.style.display = 'none';
    }
  }
}

function renderLog() {
  const container = $('logContainer');
  const empty     = $('logEmpty');
  const footer    = $('logFooter');
  const count     = $('logCount');
  const total     = $('logTotal');
  if (!container) return;

  if (empty) empty.style.display = state.log.length ? 'none' : '';

  // remove old entries
  container.querySelectorAll('.log-entry').forEach(e => e.remove());

  state.log.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const rc = entry.reward > 0 ? 'log-pos' : entry.reward < 0 ? 'log-neg' : 'log-zero';
    const rStr = (entry.reward >= 0 ? '+' : '') + entry.reward.toFixed(3);

    div.innerHTML = `
      <span class="log-step">#${entry.step}</span>
      <div>
        <div class="log-main">
          ${entry.action_type}
          <span class="log-sep"> → </span>
          <span class="log-col">${entry.column}</span>
          ${entry.method ? `<span class="log-mth"> [${entry.method}]</span>` : ''}
        </div>
        ${entry.result ? `<div class="log-result">${entry.result}</div>` : ''}
      </div>
      <div class="log-reward ${rc}">${rStr}</div>`;

    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;

  if (footer) footer.style.display = state.log.length ? 'flex' : 'none';
  if (count)  count.textContent = `${state.log.length} actions`;
  if (total)  total.textContent = `Σ ${state.cumReward.toFixed(3)}`;
}

function renderGrade(data) {
  const box = $('gradeBox');
  if (!box) return;
  const score   = data.score || 0;
  const quality = data.details?.quality_score || 0;
  const passed  = score >= state.target;

  box.className = passed ? 'grade-pass' : 'grade-fail';
  box.style.display = '';
  box.innerHTML = `
    <div class="${passed ? 'grade-title-pass' : 'grade-title-fail'}">
      ${passed ? '✓ Episode Passed' : '✗ Episode Ended'}
    </div>
    <div class="grade-detail">
      Grade: ${(score * 100).toFixed(1)}% &nbsp;·&nbsp;
      Quality: ${(quality * 100).toFixed(1)}% &nbsp;·&nbsp;
      Steps: ${state.stepNum}
    </div>`;
}

function updateSuggestions(obs) {
  if (!obs) return;
  const dl = $('colSuggestions');
  const inp = $('columnName');
  const cols = [
    ...(obs.missing_columns || []),
    ...(obs.anomaly_columns  || []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  if (dl) dl.innerHTML = cols.map(c => `<option value="${c}"></option>`).join('');
  if (inp && !inp.value && cols.length) inp.value = cols[0];
}

function setLoading(on) {
  const btnReset = $('btnReset');
  const btnStep  = $('btnStep');
  if (btnReset) {
    btnReset.disabled  = on;
    btnReset.textContent = on ? '...' : (state.running ? 'Reset' : 'Start Episode');
  }
  if (btnStep) {
    if (state.running) btnStep.disabled = on;
    btnStep.textContent = on ? '...' : 'Execute Step';
  }
}

/* ══════════════════════════════════════════════════════════
   FILE UPLOAD (100% client-side)
══════════════════════════════════════════════════════════ */

function handleDragOver(e) {
  e.preventDefault();
  const dz = $('dropZone');
  if (dz) dz.classList.add('drag-over');
}
function handleDragLeave() {
  const dz = $('dropZone');
  if (dz) dz.classList.remove('drag-over');
}
function handleDrop(e) {
  e.preventDefault();
  const dz = $('dropZone');
  if (dz) dz.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file) processFile(file);
}

function processFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    alert('Please upload a .csv file');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => parseCSV(ev.target.result, file);
  reader.readAsText(file);
}

function parseCSV(text, file) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { alert('CSV appears empty'); return; }

  csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  csvData = lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row = {};
    csvHeaders.forEach((h, i) => { row[h] = vals[i] ?? ''; });
    return row;
  }).filter(r => Object.values(r).some(v => v !== ''));

  // show file info
  const fileInfoBar = $('fileInfoBar');
  const fileNameEl  = $('fileName');
  const fileSizeEl  = $('fileSize');
  if (fileInfoBar) fileInfoBar.style.display = 'flex';
  if (fileNameEl)  fileNameEl.textContent = file.name;
  if (fileSizeEl)  fileSizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB · ${csvData.length} rows`;

  const btnDl = $('btnDownload');
  if (btnDl) btnDl.style.display = '';

  analyseCSV();
  renderPreview();
}

function analyseCSV() {
  const totalCells = csvData.length * csvHeaders.length;
  let missing = 0;

  const colStats = csvHeaders.map(col => {
    const vals = csvData.map(r => r[col] ?? '');
    const nulls = vals.filter(v => {
      const lv = String(v).toLowerCase().trim();
      return lv === '' || lv === 'null' || lv === 'nan' || lv === 'none' || lv === 'n/a';
    }).length;
    missing += nulls;
    const numeric = vals.filter(v => v !== '' && !isNaN(parseFloat(v)));
    return {
      col,
      missing: nulls,
      total: vals.length,
      fillPct: ((vals.length - nulls) / vals.length * 100).toFixed(0),
      isNumeric: numeric.length > vals.length * 0.5,
    };
  });

  const quality = Math.max(0, 1 - missing / totalCells);

  const statsRow = $('statsRow');
  if (statsRow) statsRow.style.display = 'grid';

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('statRows',    csvData.length);
  set('statCols',    csvHeaders.length);
  set('statMissing', missing);
  set('statQuality', (quality * 100).toFixed(0) + '%');

  const colAnalysis = $('colAnalysis');
  const grid        = $('colAnalysisGrid');
  if (colAnalysis) colAnalysis.style.display = '';
  if (grid) {
    grid.innerHTML = colStats.map(s => `
      <div class="col-stat-card">
        <div class="flex justify-between items-start mb-1">
          <span class="mono text-[11px] text-gray-200 font-bold">${s.col}</span>
          <span class="mono text-[9px] px-1.5 py-0.5 rounded ${s.isNumeric
            ? 'text-blue-400 bg-blue-900/20 border border-blue-900/40'
            : 'text-purple-400 bg-purple-900/20 border border-purple-900/40'}">
            ${s.isNumeric ? 'numeric' : 'text'}
          </span>
        </div>
        <div class="flex justify-between mono text-[10px] text-gray-500 mb-1">
          <span>${s.fillPct}% filled</span>
          <span class="${s.missing > 0 ? 'text-red-400' : ''}">${s.missing} missing</span>
        </div>
        <div class="col-stat-bar-bg">
          <div class="col-stat-bar-fill ${s.isNumeric ? 'bg-blue-500' : 'bg-purple-500'}" style="width:${s.fillPct}%"></div>
        </div>
      </div>`).join('');
  }
}

function renderPreview() {
  const LIMIT = 20;
  const section = $('previewSection');
  const note    = $('previewNote');
  const head    = $('previewHead');
  const body    = $('previewBody');
  if (section) section.style.display = '';
  if (note)    note.textContent = csvData.length > LIMIT
    ? `showing first ${LIMIT} of ${csvData.length} rows`
    : `${csvData.length} rows`;

  if (head) head.innerHTML = `<tr>${csvHeaders.map(h => `<th>${h}</th>`).join('')}</tr>`;
  if (body) {
    body.innerHTML = csvData.slice(0, LIMIT).map(row =>
      `<tr>${csvHeaders.map(h => {
        const v  = row[h] ?? '';
        const lv = String(v).toLowerCase().trim();
        const isNull = lv === '' || lv === 'null' || lv === 'nan' || lv === 'none' || lv === 'n/a';
        return `<td class="${isNull ? 'null-cell' : ''}">${isNull ? 'NULL' : v}</td>`;
      }).join('')}</tr>`
    ).join('');
  }
}

function downloadCleaned() {
  const rows = [csvHeaders.join(',')];
  csvData.forEach(row => {
    rows.push(csvHeaders.map(h => {
      const v = row[h] ?? '';
      return String(v).includes(',') ? `"${v}"` : v;
    }).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cleaned_data.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function clearFile() {
  csvData = []; csvHeaders = [];
  const fi = $('fileInput');
  if (fi) fi.value = '';
  ['fileInfoBar', 'colAnalysis', 'previewSection'].forEach(hide);
  const sr = $('statsRow');
  if (sr) sr.style.display = 'none';
  const bd = $('btnDownload');
  if (bd) bd.style.display = 'none';
}

/* ══════════════════════════════════════════════════════════
   WIRE UP ALL EVENT LISTENERS
══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Tabs ─────────────────────────────────────────────── */
  const tabEnv    = $('tabEnv');
  const tabUpload = $('tabUpload');
  if (tabEnv)    tabEnv.addEventListener('click',    () => switchTab('env'));
  if (tabUpload) tabUpload.addEventListener('click', () => switchTab('upload'));

  /* ── Connect button ───────────────────────────────────── */
  const btnConnect = $('btnConnect');
  if (btnConnect) btnConnect.addEventListener('click', reconnect);

  /* ── Server URL: press Enter to connect ──────────────── */
  const serverUrl = $('serverUrl');
  if (serverUrl) {
    serverUrl.addEventListener('keydown', e => {
      if (e.key === 'Enter') reconnect();
    });
  }

  /* ── Task cards ───────────────────────────────────────── */
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', () => selectTask(card));
  });

  /* ── Close error banner ───────────────────────────────── */
  const btnCloseError = $('btnCloseError');
  if (btnCloseError) btnCloseError.addEventListener('click', hideError);

  /* ── Episode buttons ──────────────────────────────────── */
  const btnReset = $('btnReset');
  const btnStep  = $('btnStep');
  if (btnReset) btnReset.addEventListener('click', handleReset);
  if (btnStep)  btnStep.addEventListener('click', handleStep);

  /* ── Action type change ───────────────────────────────── */
  const actionType = $('actionType');
  if (actionType) actionType.addEventListener('change', updateActionControls);

  /* ── Threshold slider ─────────────────────────────────── */
  const threshold    = $('threshold');
  const thresholdVal = $('thresholdVal');
  if (threshold && thresholdVal) {
    threshold.addEventListener('input', () => {
      thresholdVal.textContent = threshold.value;
    });
  }

  /* ── File upload ──────────────────────────────────────── */
  const dropZone  = $('dropZone');
  const fileInput = $('fileInput');
  const btnDl     = $('btnDownload');
  const btnClear  = $('btnClearFile');

  if (dropZone) {
    dropZone.addEventListener('click',     () => fileInput && fileInput.click());
    dropZone.addEventListener('dragover',  handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop',      handleDrop);
  }
  if (fileInput) {
    fileInput.addEventListener('change', e => {
      if (e.target.files?.[0]) processFile(e.target.files[0]);
    });
  }
  if (btnDl)    btnDl.addEventListener('click',    downloadCleaned);
  if (btnClear) btnClear.addEventListener('click', clearFile);

  /* ── Initial setup ────────────────────────────────────── */
  updateActionControls();
  switchTab('env');         // show environment tab by default
  checkServer();            // check server on load
  setInterval(checkServer, 30000); // re-check every 30s
});
