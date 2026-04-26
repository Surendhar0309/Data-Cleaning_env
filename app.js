/* ═══════════════════════════════════════════════════════
   Data Cleaning Environment — app.js
   • Environment tab: connects to configurable server URL
   • Upload tab: 100% client-side CSV parsing, no server
   ═══════════════════════════════════════════════════════ */

/* ── State ──────────────────────────────────────────────── */
let API = 'http://localhost:7860';

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

let csvData = [];     // parsed rows
let csvHeaders = [];  // column names

/* ── DOM ────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Tabs ───────────────────────────────────────────────── */
function switchTab(tab) {
  $('panelEnv').classList.toggle('hidden', tab !== 'env');
  $('panelUpload').classList.toggle('hidden', tab !== 'upload');
  $('tabEnv').classList.toggle('active-tab', tab === 'env');
  $('tabUpload').classList.toggle('active-tab', tab === 'upload');
}

/* ── Server connection ──────────────────────────────────── */
function reconnect() {
  API = ($('serverUrl').value || '').replace(/\/$/, '');
  checkServer();
}

async function checkServer() {
  try {
    const r = await fetch(`${API}/`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      setStatus('online', 'server online');
      return true;
    }
  } catch {}
  setStatus('offline', 'server offline');
  return false;
}

function setStatus(state, label) {
  const dot = $('statusDot');
  dot.className = `status-dot-${state}`;
  $('statusLabel').textContent = label;
}

function showError(msg) {
  $('errorBanner').classList.remove('hidden');
  $('errorMsg').textContent = msg;
}

/* ── ENVIRONMENT TAB ────────────────────────────────────── */
const METHODS = {
  handle_missing: ['mean','median','delete','forward_fill'],
  standardize:    ['lowercase','uppercase','title_case','minmax','zscore'],
  detect_anomaly: [],
  validate:       [],
  aggregate:      [],
};

async function handleReset() {
  if (state.loading) return;
  state.loading = true; setLoading(true);
  $('errorBanner').classList.add('hidden');
  hideGrade();

  const ok = await checkServer();
  if (!ok) {
    showError(`Cannot reach ${API} — update the SERVER URL and click Connect.`);
    state.loading = false; setLoading(false);
    return;
  }

  try {
    const r = await fetch(`${API}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task }),
    });
    const d = await r.json();
    state.obs = d.observation;
    state.running = true;
    state.stepNum = 0;
    state.cumReward = 0;
    state.log = [];

    renderMetrics(); renderQuality(d.observation);
    renderColStatus(d.observation); renderLog();
    updateSuggestions(d.observation);
    $('btnReset').textContent = 'Reset';
    $('btnStep').disabled = false;
  } catch (e) {
    showError(`Reset failed: ${e.message}`);
  }
  state.loading = false; setLoading(false);
}

async function handleStep() {
  if (!state.running || state.loading) return;
  state.loading = true; setLoading(true);

  const actionType = $('actionType').value;
  const colName = $('columnName').value.trim() || state.obs?.missing_columns?.[0] || 'amount';
  const action = { action_type: actionType, column_name: colName };
  if (METHODS[actionType]?.length) action.method = $('method').value;
  if (actionType === 'detect_anomaly') action.threshold = parseFloat($('threshold').value);

  try {
    const r = await fetch(`${API}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, action }),
    });
    const d = await r.json();
    const reward = d.reward?.immediate_reward ?? 0;
    state.stepNum++;
    state.cumReward = +(state.cumReward + reward).toFixed(4);
    state.obs = d.observation;

    state.log.push({
      step: state.stepNum, action_type: action.action_type,
      column: action.column_name, method: action.method || null,
      reward, result: d.observation?.last_action_result || '',
    });

    renderMetrics(); renderQuality(d.observation);
    renderColStatus(d.observation); renderLog();
    updateSuggestions(d.observation);

    if (d.done) {
      state.running = false;
      $('btnStep').disabled = true;
      await handleGrade();
    }
  } catch (e) {
    showError(`Step failed: ${e.message}`);
  }
  state.loading = false; setLoading(false);
}

async function handleGrade() {
  try {
    const r = await fetch(`${API}/grader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, episode_data: {} }),
    });
    const d = await r.json();
    const passed = d.score >= state.target;
    const box = $('gradeBox');
    box.className = passed ? 'grade-pass' : 'grade-fail';
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="font-semibold text-sm mb-1 ${passed ? 'text-green-400' : 'text-red-400'}">
        ${passed ? '✓ Episode Passed' : '✗ Episode Ended'}
      </div>
      <div class="mono text-[10px] text-gray-400">
        Grade: ${(d.score*100).toFixed(1)}% · Quality: ${((d.details?.quality_score||0)*100).toFixed(1)}% · Steps: ${state.stepNum}
      </div>`;
  } catch {}
}

function hideGrade() { $('gradeBox').classList.add('hidden'); }

/* renderers */
function renderMetrics() {
  $('metricSteps').textContent    = state.stepNum;
  $('metricReward').textContent   = state.cumReward.toFixed(2);
  $('metricComplete').textContent = `${(state.obs?.completion_percentage||0).toFixed(0)}%`;
}

function renderQuality(obs) {
  if (!obs) return;
  const pct  = Math.min(100, (obs.data_quality_score||0)*100);
  const tpct = state.target * 100;
  $('qualityValue').textContent = pct.toFixed(1)+'%';
  $('qualityFill').style.width  = pct+'%';
  $('qualityFill').className    = `quality-fill ${pct >= tpct ? 'good' : 'warn'}`;
  $('targetMarker').style.left  = tpct+'%';
  $('targetLabel').textContent  = `target ${tpct.toFixed(0)}%`;
}

function renderColStatus(obs) {
  if (!obs) return;
  $('colStatusCard').classList.remove('hidden');
  const grp = (el, cols, cls, label) => {
    el.innerHTML = '';
    if (!cols?.length) return;
    el.innerHTML = `<div class="mb-2.5">
      <p class="mono text-[9px] tracking-wider text-gray-600 mb-1.5">${label}</p>
      <div class="flex flex-wrap gap-1.5">${cols.map(c=>`<span class="${cls}">${c}</span>`).join('')}</div>
    </div>`;
  };
  grp($('missingCols'),      obs.missing_columns,     'tag-missing',      'MISSING');
  grp($('anomalyCols'),      obs.anomaly_columns,     'tag-anomaly',      'ANOMALIES');
  grp($('standardizedCols'), obs.standardized_columns,'tag-standardized', 'STANDARDIZED');
  const la = $('lastAction');
  if (obs.last_action_result) { la.textContent = obs.last_action_result; la.classList.remove('hidden'); }
  else la.classList.add('hidden');
}

function renderLog() {
  $('logEmpty').style.display = state.log.length ? 'none' : 'block';
  $('logContainer').querySelectorAll('.log-entry').forEach(e => e.remove());
  state.log.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    const rc = entry.reward > 0 ? 'text-green-400' : entry.reward < 0 ? 'text-red-400' : 'text-gray-600';
    div.innerHTML = `
      <span class="mono text-[10px] text-gray-600">#${entry.step}</span>
      <div>
        <div class="mono text-[11px] text-gray-200 mb-0.5">
          ${entry.action_type}<span class="text-gray-600"> → </span><span class="text-blue-400">${entry.column}</span>
          ${entry.method ? `<span class="text-gray-600"> [${entry.method}]</span>` : ''}
        </div>
        ${entry.result ? `<div class="text-[10px] text-gray-500">${entry.result}</div>` : ''}
      </div>
      <div class="mono text-[11px] font-bold text-right ${rc}">${entry.reward>=0?'+':''}${entry.reward.toFixed(3)}</div>`;
    $('logContainer').appendChild(div);
  });
  $('logContainer').scrollTop = $('logContainer').scrollHeight;
  if (state.log.length) {
    $('logFooter').classList.remove('hidden');
    $('logFooter').classList.add('flex');
    $('logCount').textContent = `${state.log.length} actions`;
    $('logTotal').textContent = `Σ ${state.cumReward.toFixed(3)}`;
  } else {
    $('logFooter').classList.add('hidden');
    $('logFooter').classList.remove('flex');
  }
}

function updateSuggestions(obs) {
  if (!obs) return;
  const cols = [...(obs.missing_columns||[]), ...(obs.anomaly_columns||[])].filter((v,i,a)=>a.indexOf(v)===i);
  $('colSuggestions').innerHTML = cols.map(c=>`<option value="${c}"></option>`).join('');
  if (!$('columnName').value && cols.length) $('columnName').value = cols[0];
}

function setLoading(on) {
  $('btnReset').disabled = on;
  if (state.running) $('btnStep').disabled = on;
  $('btnReset').textContent = on ? '...' : (state.running ? 'Reset' : 'Start Episode');
  $('btnStep').textContent  = on ? '...' : 'Execute Step';
}

function updateActionControls() {
  const type = $('actionType').value;
  const methods = METHODS[type]||[];
  $('methodGroup').classList.toggle('hidden', !methods.length);
  if (methods.length) $('method').innerHTML = methods.map(m=>`<option value="${m}">${m}</option>`).join('');
  $('thresholdGroup').classList.toggle('hidden', type !== 'detect_anomaly');
}

const barColors = { easy:'#4ade80', medium:'#fbbf24', hard:'#f87171' };
function selectTask(card) {
  document.querySelectorAll('.task-card').forEach(c => {
    const b = c.querySelector('.task-bar');
    if (b) b.style.background = 'transparent';
    c.classList.remove('selected');
  });
  const bar = card.querySelector('.task-bar');
  if (bar) bar.style.background = barColors[card.dataset.difficulty]||'#4ade80';
  card.classList.add('selected');

  state.task   = card.dataset.task;
  state.target = parseFloat(card.dataset.target);
  state.running = false; state.stepNum = 0; state.cumReward = 0; state.obs = null; state.log = [];

  renderMetrics(); renderLog();
  $('colStatusCard').classList.add('hidden');
  $('btnReset').textContent = 'Start Episode';
  $('btnStep').disabled = true;
  hideGrade();
  $('targetMarker').style.left  = (state.target*100)+'%';
  $('targetLabel').textContent  = `target ${(state.target*100).toFixed(0)}%`;
  $('qualityValue').textContent = '—';
  $('qualityFill').style.width  = '0%';
}

/* ── UPLOAD TAB — 100% client-side ─────────────────────── */
function handleDragOver(e) { e.preventDefault(); $('dropZone').classList.add('drag-over'); }
function handleDragLeave()  { $('dropZone').classList.remove('drag-over'); }
function handleDrop(e) {
  e.preventDefault(); $('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
}
function handleFileSelect(e) { if (e.target.files[0]) processFile(e.target.files[0]); }

function processFile(file) {
  if (!file.name.endsWith('.csv')) { alert('Please upload a .csv file'); return; }
  const reader = new FileReader();
  reader.onload = e => parseCSV(e.target.result, file);
  reader.readAsText(file);
}

function parseCSV(text, file) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) { alert('CSV appears empty'); return; }

  csvHeaders = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  csvData = lines.slice(1).map(line => {
    // simple CSV split (handles quoted fields)
    const vals = []; let cur = ''; let inQ = false;
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
  $('fileInfoBar').classList.remove('hidden');
  $('fileName').textContent = file.name;
  $('fileSize').textContent = `${(file.size/1024).toFixed(1)} KB · ${csvData.length} rows`;

  analyseCSV();
  renderPreview();
  $('btnDownload').classList.remove('hidden');
}

function analyseCSV() {
  const totalCells = csvData.length * csvHeaders.length;
  let missingCount = 0;

  const colStats = csvHeaders.map(col => {
    const vals = csvData.map(r => r[col]);
    const missing = vals.filter(v => v===''||v===null||v===undefined||v.toLowerCase()==='null'||v.toLowerCase()==='nan'||v.toLowerCase()==='none').length;
    const numeric = vals.filter(v => v!=='' && !isNaN(parseFloat(v)));
    missingCount += missing;
    return { col, missing, total: vals.length, fillPct: ((vals.length-missing)/vals.length*100).toFixed(0),
             isNumeric: numeric.length > vals.length*0.5 };
  });

  const quality = Math.max(0, (1 - missingCount/totalCells)).toFixed(2);

  // stats row
  $('statsRow').classList.remove('hidden');
  $('statsRow').style.display = 'grid';
  $('statRows').textContent    = csvData.length;
  $('statCols').textContent    = csvHeaders.length;
  $('statMissing').textContent = missingCount;
  $('statQuality').textContent = (quality*100).toFixed(0)+'%';

  // col analysis
  $('colAnalysis').classList.remove('hidden');
  $('colAnalysisGrid').innerHTML = colStats.map(s => `
    <div class="col-stat-card">
      <div class="flex justify-between items-start mb-1">
        <span class="mono text-[11px] text-gray-200 font-bold">${s.col}</span>
        <span class="mono text-[9px] px-1.5 py-0.5 rounded ${s.isNumeric ? 'text-blue-400 bg-blue-900/20 border border-blue-900' : 'text-purple-400 bg-purple-900/20 border border-purple-900'}">${s.isNumeric?'numeric':'text'}</span>
      </div>
      <div class="flex justify-between mono text-[10px] text-gray-500 mb-1">
        <span>${s.fillPct}% filled</span>
        <span class="${s.missing>0?'text-red-400':''}">${s.missing} missing</span>
      </div>
      <div class="col-stat-bar-bg">
        <div class="col-stat-bar-fill ${s.isNumeric?'bg-blue-500':'bg-purple-500'}" style="width:${s.fillPct}%"></div>
      </div>
    </div>`).join('');
}

function renderPreview() {
  const LIMIT = 20;
  $('previewSection').classList.remove('hidden');
  $('previewNote').textContent = csvData.length > LIMIT ? `showing first ${LIMIT} of ${csvData.length} rows` : `${csvData.length} rows`;

  $('previewHead').innerHTML = `<tr>${csvHeaders.map(h=>`<th>${h}</th>`).join('')}</tr>`;
  $('previewBody').innerHTML = csvData.slice(0,LIMIT).map(row =>
    `<tr>${csvHeaders.map(h => {
      const v = row[h]??'';
      const isNull = v===''||v.toLowerCase()==='null'||v.toLowerCase()==='nan'||v.toLowerCase()==='none';
      return `<td class="${isNull?'null-cell':''}">${isNull?'NULL':v}</td>`;
    }).join('')}</tr>`
  ).join('');
}

function downloadCleaned() {
  // simple cleaned CSV: replace empty/null with empty string
  const rows = [csvHeaders.join(',')];
  csvData.forEach(row => {
    rows.push(csvHeaders.map(h => {
      const v = row[h]??'';
      return v.includes(',') ? `"${v}"` : v;
    }).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cleaned_data.csv';
  a.click();
}

function clearFile() {
  csvData = []; csvHeaders = [];
  $('fileInput').value = '';
  ['fileInfoBar','statsRow','colAnalysis','previewSection'].forEach(id => $( id).classList.add('hidden'));
  $('btnDownload').classList.add('hidden');
}

/* ── Events ─────────────────────────────────────────────── */
$('btnReset').addEventListener('click', handleReset);
$('btnStep').addEventListener('click', handleStep);
$('actionType').addEventListener('change', updateActionControls);
$('threshold').addEventListener('input', () => { $('thresholdVal').textContent = $('threshold').value; });
document.querySelectorAll('.task-card').forEach(c => c.addEventListener('click', () => selectTask(c)));

/* ── Init ───────────────────────────────────────────────── */
(async function init() {
  updateActionControls();
  $('targetMarker').style.left = '85%';
  await checkServer();
  setInterval(checkServer, 30000);
})();
