/* ═══════════════════════════════════════════════════════
   Data Cleaning Environment — App Logic  v2.0
   Connects to FastAPI server (configurable URL)
   ═══════════════════════════════════════════════════════ */

/* ── Server URL: reads from localStorage or defaults to localhost ── */
let API = localStorage.getItem('dcenv_server_url') || 'http://localhost:7860';

/* ── State ──────────────────────────────────────────────── */
const state = {
  task: 'easy_sales_cleaning',
  target: 0.85,
  running: false,
  stepNum: 0,
  cumReward: 0,
  obs: null,
  log: [],
  loading: false,
  uploadedTask: null,   // track if a custom CSV was uploaded
};

/* ── DOM refs ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const ui = {
  statusDot:        $('statusDot'),
  statusLabel:      $('statusLabel'),
  serverUrlInput:   $('serverUrlInput'),
  serverUrlSave:    $('serverUrlSave'),
  taskCards:        document.querySelectorAll('.task-card'),
  metricSteps:      $('metricSteps'),
  metricReward:     $('metricReward'),
  metricComplete:   $('metricComplete'),
  qualityValue:     $('qualityValue'),
  qualityFill:      $('qualityFill'),
  targetMarker:     $('targetMarker'),
  targetLabel:      $('targetLabel'),
  colStatusCard:    $('colStatusCard'),
  missingCols:      $('missingCols'),
  anomalyCols:      $('anomalyCols'),
  standardizedCols: $('standardizedCols'),
  lastAction:       $('lastAction'),
  actionType:       $('actionType'),
  columnName:       $('columnName'),
  colSuggestions:   $('colSuggestions'),
  method:           $('method'),
  methodGroup:      $('methodGroup'),
  threshold:        $('threshold'),
  thresholdVal:     $('thresholdVal'),
  thresholdGroup:   $('thresholdGroup'),
  btnReset:         $('btnReset'),
  btnStep:          $('btnStep'),
  btnDownload:      $('btnDownload'),
  gradeBox:         $('gradeBox'),
  gradeTitle:       $('gradeTitle'),
  gradeDetail:      $('gradeDetail'),
  logContainer:     $('logContainer'),
  logEmpty:         $('logEmpty'),
  logFooter:        $('logFooter'),
  logCount:         $('logCount'),
  logTotal:         $('logTotal'),
  uploadInput:      $('uploadInput'),
  uploadBtn:        $('uploadBtn'),
  uploadStatus:     $('uploadStatus'),
};

/* ── Methods per action type ────────────────────────────── */
const METHODS = {
  handle_missing: ['mean', 'median', 'delete', 'forward_fill'],
  standardize:    ['lowercase', 'uppercase', 'title_case', 'minmax', 'zscore'],
  detect_anomaly: [],
  validate:       [],
  aggregate:      [],
};

/* ── Server URL config ──────────────────────────────────── */
function initServerUrl() {
  if (ui.serverUrlInput) ui.serverUrlInput.value = API;
}

function saveServerUrl() {
  const val = ui.serverUrlInput?.value?.trim();
  if (!val) return;
  API = val.replace(/\/$/, '');
  localStorage.setItem('dcenv_server_url', API);
  setStatus('connecting');
  checkServer();
}

function setStatus(state) {
  if (state === 'online') {
    ui.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#3ddc84]';
    ui.statusLabel.textContent = 'server online';
  } else if (state === 'offline') {
    ui.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-red-400';
    ui.statusLabel.textContent = 'server offline';
  } else {
    ui.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-gray-500 animate-pulse';
    ui.statusLabel.textContent = 'connecting...';
  }
}

/* ── Server health check ────────────────────────────────── */
async function checkServer() {
  try {
    const r = await fetch(`${API}/`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) {
      setStatus('online');
      return true;
    }
  } catch {}
  setStatus('offline');
  return false;
}

/* ── Reset ──────────────────────────────────────────────── */
async function handleReset() {
  if (state.loading) return;
  state.loading = true;
  setLoading(true);
  hideGrade();

  try {
    const r = await fetch(`${API}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const obs = d.observation;

    state.obs = obs;
    state.running = true;
    state.stepNum = 0;
    state.cumReward = 0;
    state.log = [];

    renderMetrics();
    renderQuality(obs);
    renderColumnStatus(obs);
    renderLog();
    updateSuggestions(obs);

    ui.btnReset.textContent = 'Reset';
    ui.btnStep.disabled = false;
    ui.btnDownload.disabled = false;

  } catch (e) {
    showError('Could not connect to server.\n\n1. Make sure python server.py is running\n2. Update the Server URL above to match your server address');
  }

  state.loading = false;
  setLoading(false);
}

/* ── Step ───────────────────────────────────────────────── */
async function handleStep() {
  if (!state.running || state.loading) return;
  state.loading = true;
  setLoading(true);

  const actionType = ui.actionType.value;
  const colName = ui.columnName.value.trim() ||
    (state.obs?.missing_columns?.[0] || 'amount');

  const action = { action_type: actionType, column_name: colName };
  if (METHODS[actionType]?.length) action.method = ui.method.value;
  if (actionType === 'detect_anomaly') action.threshold = parseFloat(ui.threshold.value);

  try {
    const r = await fetch(`${API}/step`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, action }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();

    const reward = d.reward?.immediate_reward ?? 0;
    state.stepNum++;
    state.cumReward = +(state.cumReward + reward).toFixed(4);
    state.obs = d.observation;

    state.log.push({
      step: state.stepNum,
      action_type: action.action_type,
      column: action.column_name,
      method: action.method || null,
      reward,
      result: d.observation?.last_action_result || '',
    });

    renderMetrics();
    renderQuality(d.observation);
    renderColumnStatus(d.observation);
    renderLog();
    updateSuggestions(d.observation);

    if (d.done) {
      state.running = false;
      ui.btnStep.disabled = true;
      await handleGrade();
    }

  } catch (e) {
    console.error('Step failed:', e);
  }

  state.loading = false;
  setLoading(false);
}

/* ── Grade ──────────────────────────────────────────────── */
async function handleGrade() {
  try {
    const r = await fetch(`${API}/grader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_name: state.task, episode_data: {} }),
    });
    const d = await r.json();
    showGrade(d);
  } catch (e) {
    console.error('Grade failed:', e);
  }
}

/* ── Upload CSV ─────────────────────────────────────────── */
async function handleUpload() {
  const file = ui.uploadInput.files[0];
  if (!file) {
    showUploadStatus('Please select a CSV file first.', 'error');
    return;
  }
  if (!file.name.endsWith('.csv')) {
    showUploadStatus('Only .csv files are supported.', 'error');
    return;
  }

  showUploadStatus('Uploading...', 'info');
  ui.uploadBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const r = await fetch(`${API}/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    const d = await r.json();

    // Register as active task
    state.task = 'custom_upload';
    state.target = 0.80;
    state.uploadedTask = d;
    state.obs = d.observation;
    state.running = true;
    state.stepNum = 0;
    state.cumReward = 0;
    state.log = [];

    // Deselect all preset task cards
    document.querySelectorAll('.task-card').forEach(c => {
      c.classList.remove('bg-gray-800');
      const bar = c.querySelector('.task-bar');
      if (bar) bar.style.background = 'transparent';
    });

    // Update UI
    $('uploadTaskBadge').textContent = `📄 ${file.name} (${d.rows} rows, ${d.columns.length} cols)`;
    $('uploadTaskBadge').classList.remove('hidden');

    renderMetrics();
    renderQuality(d.observation);
    renderColumnStatus(d.observation);
    updateSuggestions(d.observation);
    renderLog();

    ui.btnReset.textContent = 'Reset';
    ui.btnStep.disabled = false;
    ui.btnDownload.disabled = false;

    showUploadStatus(`✓ Loaded: ${d.rows} rows · ${d.columns.length} columns`, 'success');
    hideGrade();

  } catch (e) {
    showUploadStatus(`Upload failed: ${e.message}`, 'error');
  }

  ui.uploadBtn.disabled = false;
}

/* ── Download cleaned CSV ───────────────────────────────── */
async function handleDownload() {
  if (!state.task) return;
  try {
    const url = `${API}/download/${encodeURIComponent(state.task)}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cleaned_${state.task}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    showError('Download failed: ' + e.message);
  }
}

/* ── Status helpers ─────────────────────────────────────── */
function showUploadStatus(msg, type) {
  if (!ui.uploadStatus) return;
  ui.uploadStatus.textContent = msg;
  ui.uploadStatus.className = `mono text-[10px] mt-1.5 ` +
    (type === 'error' ? 'text-red-400' :
     type === 'success' ? 'text-green-400' : 'text-gray-400');
  ui.uploadStatus.classList.remove('hidden');
}

function showError(msg) {
  alert(msg);
}

/* ── Renderers ──────────────────────────────────────────── */
function renderMetrics() {
  ui.metricSteps.textContent    = state.stepNum;
  ui.metricReward.textContent   = state.cumReward.toFixed(2);
  ui.metricComplete.textContent = state.obs
    ? (state.obs.completion_percentage || 0).toFixed(0) + '%'
    : '0%';
}

function renderQuality(obs) {
  if (!obs) return;
  const pct  = Math.min(100, (obs.data_quality_score || 0) * 100);
  const tpct = Math.min(100, state.target * 100);

  ui.qualityValue.textContent   = pct.toFixed(1) + '%';
  ui.qualityFill.style.width    = pct + '%';
  ui.targetMarker.style.left    = tpct + '%';
  ui.targetLabel.textContent    = `target ${tpct.toFixed(0)}%`;

  if (pct >= tpct) {
    ui.qualityFill.className = 'quality-fill h-full rounded bg-gradient-to-r from-green-900 to-green-400';
  } else {
    ui.qualityFill.className = 'quality-fill h-full rounded bg-gradient-to-r from-yellow-900 to-yellow-500';
  }
}

function renderColumnStatus(obs) {
  if (!obs) return;
  ui.colStatusCard.classList.remove('hidden');

  const renderGroup = (el, cols, tagClass, label) => {
    el.innerHTML = '';
    if (!cols || cols.length === 0) return;
    el.innerHTML = `
      <div class="mb-2.5">
        <p class="mono text-[9px] tracking-wider text-gray-600 mb-1.5">${label}</p>
        <div class="flex flex-wrap gap-1.5">
          ${cols.map(c => `<span class="mono text-[10px] px-2 py-0.5 rounded border ${tagClass}">${c}</span>`).join('')}
        </div>
      </div>`;
  };

  renderGroup(ui.missingCols,      obs.missing_columns,     'text-red-300 bg-red-900/20 border-red-800/40',    'MISSING');
  renderGroup(ui.anomalyCols,      obs.anomaly_columns,     'text-amber-300 bg-amber-900/20 border-amber-800/40', 'ANOMALIES');
  renderGroup(ui.standardizedCols, obs.standardized_columns,'text-green-400 bg-green-900/20 border-green-800/40', 'STANDARDIZED');

  if (obs.last_action_result) {
    ui.lastAction.textContent = obs.last_action_result;
    ui.lastAction.classList.remove('hidden');
  } else {
    ui.lastAction.classList.add('hidden');
  }
}

function renderLog() {
  ui.logEmpty.style.display = state.log.length ? 'none' : 'block';
  ui.logContainer.querySelectorAll('.log-entry').forEach(e => e.remove());

  state.log.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'log-entry grid gap-2 py-2 border-b border-gray-800 items-start';
    div.style.gridTemplateColumns = '28px 1fr 56px';

    const rewardColor = entry.reward > 0
      ? 'text-green-400' : entry.reward < 0
      ? 'text-red-400' : 'text-gray-600';
    const rewardStr = (entry.reward >= 0 ? '+' : '') + entry.reward.toFixed(3);

    div.innerHTML = `
      <span class="mono text-[10px] text-gray-600 pt-0.5">#${entry.step}</span>
      <div>
        <div class="mono text-[11px] text-gray-200 mb-0.5">
          ${entry.action_type}
          <span class="text-gray-600"> → </span>
          <span class="text-blue-400">${entry.column}</span>
          ${entry.method ? `<span class="text-gray-600"> [${entry.method}]</span>` : ''}
        </div>
        ${entry.result ? `<div class="text-[10px] text-gray-500 leading-snug">${entry.result}</div>` : ''}
      </div>
      <div class="mono text-[11px] font-bold text-right pt-0.5 ${rewardColor}">${rewardStr}</div>
    `;
    ui.logContainer.appendChild(div);
  });

  ui.logContainer.scrollTop = ui.logContainer.scrollHeight;

  if (state.log.length) {
    ui.logFooter.classList.remove('hidden');
    ui.logFooter.classList.add('flex');
    ui.logCount.textContent = `${state.log.length} actions`;
    ui.logTotal.textContent = `Σ ${state.cumReward.toFixed(3)}`;
  } else {
    ui.logFooter.classList.add('hidden');
    ui.logFooter.classList.remove('flex');
  }
}

function showGrade(d) {
  const score  = d.score || 0;
  const quality = d.details?.quality_score || 0;
  const passed  = score >= state.target;

  ui.gradeBox.classList.remove('hidden');
  ui.gradeBox.className = passed
    ? 'p-3.5 rounded-lg border bg-green-900/10 border-green-800/40'
    : 'p-3.5 rounded-lg border bg-red-900/10 border-red-800/40';

  ui.gradeTitle.className = passed ? 'font-semibold text-sm mb-1 text-green-400' : 'font-semibold text-sm mb-1 text-red-400';
  ui.gradeTitle.textContent = passed ? '✓ Episode Passed' : '✗ Episode Ended';
  ui.gradeDetail.textContent =
    `Grade: ${(score * 100).toFixed(1)}%  ·  Quality: ${(quality * 100).toFixed(1)}%  ·  Steps: ${state.stepNum}`;
}

function hideGrade() {
  ui.gradeBox.classList.add('hidden');
}

function updateSuggestions(obs) {
  if (!obs) return;
  const cols = [
    ...(obs.missing_columns || []),
    ...(obs.anomaly_columns || []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  ui.colSuggestions.innerHTML = cols.map(c => `<option value="${c}"></option>`).join('');
  if (!ui.columnName.value && cols.length) ui.columnName.value = cols[0];
}

function setLoading(loading) {
  ui.btnReset.disabled = loading;
  if (state.running) ui.btnStep.disabled = loading;
  ui.btnReset.textContent = loading ? '...' : (state.running ? 'Reset' : 'Start Episode');
  ui.btnStep.textContent  = loading ? '...' : 'Execute Step';
}

/* ── Action type controls ───────────────────────────────── */
function updateActionControls() {
  const type    = ui.actionType.value;
  const methods = METHODS[type] || [];

  if (methods.length) {
    ui.methodGroup.classList.remove('hidden');
    ui.method.innerHTML = methods.map(m => `<option value="${m}">${m}</option>`).join('');
  } else {
    ui.methodGroup.classList.add('hidden');
  }

  if (type === 'detect_anomaly') {
    ui.thresholdGroup.classList.remove('hidden');
  } else {
    ui.thresholdGroup.classList.add('hidden');
  }
}

/* ── Task selection ─────────────────────────────────────── */
const barColors = { easy: '#3ddc84', medium: '#f5a623', hard: '#e0533a' };

function selectTask(card) {
  document.querySelectorAll('.task-card').forEach(c => {
    const bar = c.querySelector('.task-bar');
    if (bar) bar.style.background = 'transparent';
    c.classList.remove('bg-gray-800');
  });

  const bar = card.querySelector('.task-bar');
  if (bar) bar.style.background = barColors[card.dataset.difficulty] || '#3ddc84';
  card.classList.add('bg-gray-800');

  state.task    = card.dataset.task;
  state.target  = parseFloat(card.dataset.target);
  state.running = false;
  state.stepNum = 0;
  state.cumReward = 0;
  state.obs = null;
  state.log = [];
  state.uploadedTask = null;

  const badge = $('uploadTaskBadge');
  if (badge) badge.classList.add('hidden');

  renderMetrics();
  renderLog();
  ui.colStatusCard.classList.add('hidden');
  ui.btnReset.textContent = 'Start Episode';
  ui.btnStep.disabled = true;
  ui.btnDownload.disabled = true;
  hideGrade();

  ui.targetMarker.style.left  = (state.target * 100) + '%';
  ui.targetLabel.textContent  = `target ${(state.target * 100).toFixed(0)}%`;
  ui.qualityValue.textContent = '—';
  ui.qualityFill.style.width  = '0%';
}

/* ── Event listeners ────────────────────────────────────── */
ui.btnReset.addEventListener('click', handleReset);
ui.btnStep.addEventListener('click', handleStep);
ui.btnDownload.addEventListener('click', handleDownload);
ui.actionType.addEventListener('change', updateActionControls);
ui.threshold.addEventListener('input', () => {
  ui.thresholdVal.textContent = ui.threshold.value;
});
ui.taskCards.forEach(card => card.addEventListener('click', () => selectTask(card)));

if (ui.serverUrlSave) ui.serverUrlSave.addEventListener('click', saveServerUrl);
if (ui.uploadBtn) ui.uploadBtn.addEventListener('click', handleUpload);
if (ui.uploadInput) {
  ui.uploadInput.addEventListener('change', () => {
    const f = ui.uploadInput.files[0];
    if (f) showUploadStatus(`Selected: ${f.name}`, 'info');
  });
}

/* ── Init ───────────────────────────────────────────────── */
(async function init() {
  initServerUrl();
  updateActionControls();
  ui.targetMarker.style.left = (state.target * 100) + '%';
  setStatus('connecting');
  await checkServer();
  setInterval(checkServer, 30000);
})();
