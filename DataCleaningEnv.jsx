import { useState, useRef, useEffect } from "react";

const API = "http://localhost:7860";

const TASKS = [
  { name: "easy_sales_cleaning", label: "Sales Cleaning", difficulty: "easy", target: 0.85, color: "#1D9E75", rows: 30 },
  { name: "medium_customer_cleaning", label: "Customer Cleaning", difficulty: "medium", target: 0.80, color: "#BA7517", rows: 40 },
  { name: "hard_survey_analytics", label: "Survey Analytics", difficulty: "hard", target: 0.75, color: "#D85A30", rows: 50 },
];

const ACTION_TYPES = ["handle_missing", "detect_anomaly", "standardize", "validate", "aggregate"];
const METHODS = {
  handle_missing: ["mean", "median", "delete", "forward_fill"],
  standardize: ["lowercase", "uppercase", "title_case", "minmax", "zscore"],
  detect_anomaly: [],
  validate: [],
  aggregate: [],
};

const diffColor = { easy: "#1D9E75", medium: "#BA7517", hard: "#D85A30" };

function QualityBar({ value, target, color }) {
  const pct = Math.min(100, (value || 0) * 100);
  const tpct = Math.min(100, target * 100);
  return (
    <div style={{ position: "relative", marginTop: 8 }}>
      <div style={{ background: "var(--color-background-secondary)", borderRadius: 4, height: 10, overflow: "visible", position: "relative" }}>
        <div style={{ background: color, width: `${pct}%`, height: "100%", borderRadius: 4, transition: "width 0.5s ease" }} />
        <div style={{ position: "absolute", left: `${tpct}%`, top: -3, width: 2, height: 16, background: "var(--color-text-secondary)", borderRadius: 1, transform: "translateX(-50%)" }} title={`Target: ${target}`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{(pct).toFixed(1)}%</span>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>target {(target * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function Badge({ children, color, bg }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, padding: "2px 7px",
      borderRadius: 4, background: bg || "var(--color-background-secondary)",
      color: color || "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)"
    }}>{children}</span>
  );
}

function LogLine({ entry }) {
  const rewardColor = entry.reward > 0 ? "#1D9E75" : entry.reward < 0 ? "#D85A30" : "var(--color-text-secondary)";
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", borderBottom: "0.5px solid var(--color-border-tertiary)", alignItems: "flex-start" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-tertiary)", minWidth: 22 }}>#{entry.step}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--color-text-primary)" }}>
          {entry.action_type}
          <span style={{ color: "var(--color-text-secondary)" }}> → </span>
          <span style={{ color: "#185FA5" }}>{entry.column}</span>
          {entry.method && <span style={{ color: "var(--color-text-tertiary)" }}> [{entry.method}]</span>}
        </span>
        {entry.result && (
          <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{entry.result}</div>
        )}
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: rewardColor, minWidth: 48, textAlign: "right" }}>
        {entry.reward >= 0 ? "+" : ""}{entry.reward?.toFixed(3)}
      </span>
    </div>
  );
}

export default function App() {
  const [task, setTask] = useState(TASKS[0]);
  const [obs, setObs] = useState(null);
  const [actionType, setActionType] = useState("handle_missing");
  const [column, setColumn] = useState("");
  const [method, setMethod] = useState("mean");
  const [threshold, setThreshold] = useState(2.5);
  const [log, setLog] = useState([]);
  const [stepNum, setStepNum] = useState(0);
  const [cumReward, setCumReward] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [serverOk, setServerOk] = useState(null);
  const [gradeResult, setGradeResult] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/`).then(r => r.json()).then(() => setServerOk(true)).catch(() => setServerOk(false));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  async function handleReset() {
    setLoading(true);
    setGradeResult(null);
    try {
      const r = await fetch(`${API}/reset`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_name: task.name })
      });
      const d = await r.json();
      setObs(d.observation);
      setLog([]);
      setStepNum(0);
      setCumReward(0);
      setStatus("running");
      const cols = d.observation?.missing_columns || [];
      if (cols.length) setColumn(cols[0]);
    } catch { setStatus("error"); }
    setLoading(false);
  }

  async function handleStep() {
    if (!obs || loading) return;
    setLoading(true);
    const action = {
      action_type: actionType,
      column_name: column || (obs.missing_columns?.[0] || "amount"),
      ...(METHODS[actionType]?.length ? { method } : {}),
      ...(actionType === "detect_anomaly" ? { threshold } : {}),
    };
    try {
      const r = await fetch(`${API}/step`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_name: task.name, action })
      });
      const d = await r.json();
      const reward = d.reward?.immediate_reward ?? 0;
      const newStep = stepNum + 1;
      setStepNum(newStep);
      setCumReward(c => +(c + reward).toFixed(4));
      setObs(d.observation);
      setLog(prev => [...prev, {
        step: newStep, action_type: action.action_type, column: action.column_name,
        method: action.method || null, reward, result: d.observation?.last_action_result
      }]);
      if (d.done) {
        setStatus("done");
        handleGrade();
      }
    } catch { setStatus("error"); }
    setLoading(false);
  }

  async function handleGrade() {
    try {
      const r = await fetch(`${API}/grader`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_name: task.name, episode_data: {} })
      });
      const d = await r.json();
      setGradeResult(d);
    } catch {}
  }

  const colSuggestions = [
    ...(obs?.missing_columns || []),
    ...(obs?.anomaly_columns || []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const qualityScore = obs?.data_quality_score ?? 0;
  const taskConfig = TASKS.find(t => t.name === task.name) || TASKS[0];

  return (
    <div style={{ fontFamily: "var(--font-sans)", maxWidth: 700, margin: "0 auto", padding: "1rem 0" }}>
      <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 4px", color: "var(--color-text-primary)" }}>Data Cleaning Environment</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 1.25rem" }}>
        Interactive OpenEnv agent interface — connect to your local server
      </p>

      {serverOk === false && (
        <div style={{ background: "var(--color-background-danger)", border: "0.5px solid var(--color-border-danger)", borderRadius: "var(--border-radius-md)", padding: "10px 14px", marginBottom: "1rem", fontSize: 13, color: "var(--color-text-danger)" }}>
          Server not reachable at <code style={{ fontFamily: "var(--font-mono)" }}>localhost:7860</code>. Run <code style={{ fontFamily: "var(--font-mono)" }}>python server.py</code> first, then reload.
        </div>
      )}

      {/* Task selector */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1.25rem" }}>
        {TASKS.map(t => (
          <div key={t.name} onClick={() => { setTask(t); setObs(null); setLog([]); setStatus("idle"); setGradeResult(null); }}
            style={{
              border: task.name === t.name ? `2px solid ${t.color}` : "0.5px solid var(--color-border-tertiary)",
              borderRadius: "var(--border-radius-lg)", padding: "10px 12px", cursor: "pointer",
              background: "var(--color-background-primary)", transition: "border 0.15s"
            }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>{t.label}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <Badge color={t.color}>{t.difficulty}</Badge>
              <Badge>{t.rows} rows</Badge>
            </div>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>

        {/* Left: observation + action */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Metrics */}
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, fontWeight: 500 }}>EPISODE STATE</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { label: "step", value: stepNum },
                { label: "reward", value: cumReward.toFixed(2) },
                { label: "complete", value: `${(obs?.completion_percentage || 0).toFixed(0)}%` },
              ].map(m => (
                <div key={m.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 2 }}>{m.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)" }}>{m.value}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>data quality</div>
            <QualityBar value={qualityScore} target={taskConfig.target} color={taskConfig.color} />
          </div>

          {/* Columns info */}
          {obs && (
            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, fontWeight: 500 }}>COLUMN STATUS</div>
              {obs.missing_columns?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>missing</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {obs.missing_columns.map(c => <Badge key={c} color="#A32D2D" bg="#FCEBEB">{c}</Badge>)}
                  </div>
                </div>
              )}
              {obs.anomaly_columns?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>anomalies</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {obs.anomaly_columns.map(c => <Badge key={c} color="#854F0B" bg="#FAEEDA">{c}</Badge>)}
                  </div>
                </div>
              )}
              {obs.standardized_columns?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>standardized</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {obs.standardized_columns.map(c => <Badge key={c} color="#0F6E56" bg="#E1F5EE">{c}</Badge>)}
                  </div>
                </div>
              )}
              {obs.last_action_result && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic", borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 8 }}>
                  {obs.last_action_result}
                </div>
              )}
            </div>
          )}

          {/* Action composer */}
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 10, fontWeight: 500 }}>ACTION COMPOSER</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>action type</div>
                <select value={actionType} onChange={e => { setActionType(e.target.value); setMethod("mean"); }}
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {ACTION_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>column</div>
                <input value={column} onChange={e => setColumn(e.target.value)} placeholder="column name"
                  list="col-suggestions"
                  style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12, boxSizing: "border-box" }} />
                <datalist id="col-suggestions">
                  {colSuggestions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              {METHODS[actionType]?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>method</div>
                  <select value={method} onChange={e => setMethod(e.target.value)}
                    style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                    {METHODS[actionType].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {actionType === "detect_anomaly" && (
                <div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>threshold (σ): {threshold}</div>
                  <input type="range" min="1" max="5" step="0.1" value={threshold}
                    onChange={e => setThreshold(parseFloat(e.target.value))} style={{ width: "100%" }} />
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleReset} disabled={loading} style={{ flex: 1 }}>
              {status === "idle" ? "Start episode" : "Reset"}
            </button>
            <button onClick={handleStep} disabled={loading || status !== "running" || !obs}
              style={{ flex: 2, background: status === "running" ? taskConfig.color : undefined, color: status === "running" ? "#fff" : undefined, border: "none" }}>
              {loading ? "..." : "Execute step"}
            </button>
          </div>

          {gradeResult && (
            <div style={{
              background: gradeResult.score >= taskConfig.target ? "var(--color-background-success)" : "var(--color-background-warning)",
              border: `0.5px solid ${gradeResult.score >= taskConfig.target ? "var(--color-border-success)" : "var(--color-border-warning)"}`,
              borderRadius: "var(--border-radius-md)", padding: "10px 14px", fontSize: 13
            }}>
              <div style={{ fontWeight: 500, color: gradeResult.score >= taskConfig.target ? "var(--color-text-success)" : "var(--color-text-warning)" }}>
                {gradeResult.score >= taskConfig.target ? "Episode passed" : "Episode ended"}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 4, color: "var(--color-text-secondary)" }}>
                Grade: {(gradeResult.score * 100).toFixed(1)}% · Quality: {((gradeResult.details?.quality_score || 0) * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Right: log */}
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", display: "flex", flexDirection: "column", minHeight: 400 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8, fontWeight: 500 }}>EPISODE LOG</div>
          <div ref={logRef} style={{ flex: 1, overflowY: "auto", maxHeight: 520 }}>
            {log.length === 0 ? (
              <div style={{ color: "var(--color-text-tertiary)", fontSize: 13, marginTop: 24, textAlign: "center" }}>
                {status === "idle" ? "Start an episode to begin" : "No steps yet"}
              </div>
            ) : log.map(e => <LogLine key={e.step} entry={e} />)}
          </div>
          {log.length > 0 && (
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 10, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)" }}>
              <span>{log.length} actions</span>
              <span style={{ fontFamily: "var(--font-mono)" }}>Σ {cumReward.toFixed(3)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
