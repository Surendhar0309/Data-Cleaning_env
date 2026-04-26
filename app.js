/* ═══════════════════════════════════════════════════════
   Data Cleaning Environment — App Logic
   Connects to FastAPI server at localhost:7860
   ═══════════════════════════════════════════════════════ */

const API = 'http://localhost:7860';

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
};

/* ── DOM refs ───────────────────────────────────────────── */
const $ = id => document.getElementById(id);

const ui = {
  statusDot:      $('statusDot'),
  statusLabel:    $('statusLabel'),
  taskCards:      document.querySelectorAll('.task-card'),
  metricSteps:    $('metricSteps'),
  metricReward:   $('metricReward'),
  metricComplete: $('metricComplete'),
  qualityValue:   $('qualityValue'),
  qualityFill:    $('qualityFill'),
  targetMarker:   $('targetMarker'),
  targetLabel:    $('targetLabel'),
  colStatusCard:  $('colStatusCard'),
  missingCols:    $('missingCols'),
  anomalyCols:    $('anomalyCols'),
  standardizedCols: $('standardizedCols'),
  lastAction:     $('lastAction'),
  actionType:     $('actionType'),
  columnName:     $('columnName'),
  colSuggestions: $('colSuggestions'),
  method:         $('method'),
  methodGroup:    $('methodGroup'),
  threshold:      $('threshold'),
  thresholdVal:   $('thresholdVal'),
  thresholdGroup: $('thresholdGroup'),
  btnReset:       $('btnReset'),
  btnStep:        $('btnStep'),
  gradeBox:       $('gradeBox'),
  gradeTitle:     $('gradeTitle'),
  gradeDetail:    $('gradeDetail'),
  logContainer:   $('logContainer'),
  logEmpty:       $('logEmpty'),
  logFooter:      $('logFooter'),
  logCount:       $('logCount'),
  logTotal:       $('logTotal'),
};

/* ── Methods per action type ────────────────────────────── */
const METHODS = {
  handle_missing: ['mean', 'median', 'delete', 'forward_fill'],
  standardize:    ['lowercase', 'uppercase', 'title_case', 'minmax', 'zscore'],
  detect_anomaly: [],
  validate:       [],
  aggregate:      [],
};

/* ── Server health check ────────────────────────────────── */
async function checkServer() {
  try {
    const r = await fetch(`${API}/`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      ui.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_6px_#3ddc84]';
      ui.statusLabel.textContent = 'server online';
      return true;
    }
  } catch {}
  ui.statusDot.className = 'w-1.5 h-1.5 rounded-full bg-red-400';
  ui.statusLabel.textContent = 'server offline';
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

  } catch (e) {
    alert('Could not connect to server. Make sure python server.py is running.');
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

  // colour shift: near-target = amber, above = green
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
  // Reset bar colors on all cards
  ui.taskCards.forEach(c => {
    const bar = c.querySelector('.task-bar');
    if (bar) bar.style.background = 'transparent';
    c.classList.remove('bg-gray-800');
  });

  // Highlight selected
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

  renderMetrics();
  renderLog();
  ui.colStatusCard.classList.add('hidden');
  ui.btnReset.textContent = 'Start Episode';
  ui.btnStep.disabled = true;
  hideGrade();

  ui.targetMarker.style.left  = (state.target * 100) + '%';
  ui.targetLabel.textContent  = `target ${(state.target * 100).toFixed(0)}%`;
  ui.qualityValue.textContent = '—';
  ui.qualityFill.style.width  = '0%';
}

/* ── Event listeners ────────────────────────────────────── */
ui.btnReset.addEventListener('click', handleReset);
ui.btnStep.addEventListener('click', handleStep);
ui.actionType.addEventListener('change', updateActionControls);
ui.threshold.addEventListener('input', () => {
  ui.thresholdVal.textContent = ui.threshold.value;
});
ui.taskCards.forEach(card => card.addEventListener('click', () => selectTask(card)));

/* ── Init ───────────────────────────────────────────────── */
(async function init() {
  updateActionControls();
  ui.targetMarker.style.left = (state.target * 100) + '%';
  await checkServer();
  setInterval(checkServer, 30000);
})();
