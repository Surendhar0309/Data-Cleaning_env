"""
FastAPI server for Data Cleaning Environment.
Implements OpenEnv standard endpoints: reset, step, state, baseline, grader, tasks.
Added: /upload (CSV upload), /download (cleaned CSV export)
"""

import io
import csv
import os
import logging
from typing import Dict, Any, Optional, List

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from environment import DataCleaningEnv, CleaningAction, Observation, Reward, State

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Data Cleaning & Analytics Environment",
    description="OpenEnv-compliant environment for data cleaning RL tasks",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allows GitHub Pages webapp and any other origin to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Environments ──────────────────────────────────────────────────────────────
environments: Dict[str, DataCleaningEnv] = {
    "easy_sales_cleaning":      DataCleaningEnv(task_difficulty="easy"),
    "medium_customer_cleaning": DataCleaningEnv(task_difficulty="medium"),
    "hard_survey_analytics":    DataCleaningEnv(task_difficulty="hard"),
}

active_episodes: Dict[str, Dict[str, Any]] = {}

# ── Request models ────────────────────────────────────────────────────────────
class ResetRequest(BaseModel):
    task_name: Optional[str] = "easy_sales_cleaning"

class StepRequest(BaseModel):
    task_name: str = "easy_sales_cleaning"
    action: CleaningAction

class StateRequest(BaseModel):
    task_name: Optional[str] = "easy_sales_cleaning"

class GraderRequest(BaseModel):
    task_name: Optional[str] = "easy_sales_cleaning"
    episode_data: Optional[Dict[str, Any]] = {}

class BaselineRequest(BaseModel):
    task_name: Optional[str] = None


# ── Helper ────────────────────────────────────────────────────────────────────
def _get_env(task_name: str) -> DataCleaningEnv:
    if task_name not in environments:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown task: '{task_name}'. Valid tasks: {list(environments.keys())}"
        )
    return environments[task_name]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def health_check():
    """Health check — used by webapp to detect if server is online."""
    return {
        "status": "healthy",
        "service": "Data Cleaning & Analytics Environment",
        "version": "1.0.0",
        "available_tasks": list(environments.keys()),
    }


@app.post("/reset")
async def reset(request: Optional[ResetRequest] = None):
    """Reset environment for a task and return initial observation."""
    task_name = (request.task_name if request and request.task_name
                 else "easy_sales_cleaning")
    env = _get_env(task_name)
    observation = env.reset()

    active_episodes[task_name] = {
        "step": 0,
        "cumulative_reward": 0.0,
        "actions": [],
        "observations": [observation.model_dump()],
    }

    logger.info(f"[RESET] task={task_name}  rows={observation.total_rows}  "
                f"quality={observation.data_quality_score:.3f}")

    return {
        "status": "success",
        "observation": observation.model_dump(),
        "episode_id": task_name,
    }


@app.post("/step")
async def step(request: StepRequest):
    """Execute one cleaning action and return next observation + reward."""
    env = _get_env(request.task_name)

    if request.task_name not in active_episodes:
        observation = env.reset()
        active_episodes[request.task_name] = {
            "step": 0, "cumulative_reward": 0.0,
            "actions": [], "observations": [observation.model_dump()],
        }

    try:
        observation, reward, done, info = env.step(request.action)
    except Exception as e:
        logger.error(f"[STEP] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    episode = active_episodes[request.task_name]
    episode["step"] += 1
    episode["cumulative_reward"] += reward.immediate_reward
    episode["actions"].append(request.action.model_dump())
    episode["observations"].append(observation.model_dump())

    logger.info(f"[STEP] task={request.task_name}  step={episode['step']}  "
                f"action={request.action.action_type}/{request.action.column_name}  "
                f"reward={reward.immediate_reward:+.3f}  done={done}")

    return {
        "status": "success",
        "observation": observation.model_dump(),
        "reward": reward.model_dump(),
        "done": done,
        "info": info,
        "step": episode["step"],
    }


@app.post("/state")
@app.get("/state")
async def get_state(request: Optional[StateRequest] = None):
    """Return full current environment state."""
    task_name = (request.task_name if request and request.task_name
                 else "easy_sales_cleaning")
    env = _get_env(task_name)
    return {"status": "success", "state": env.state().model_dump()}


@app.post("/grader")
@app.get("/grader")
async def grade_episode(request: Optional[GraderRequest] = None):
    """Grade the completed episode. Score = 60% quality + 40% efficiency."""
    task_name = (request.task_name if request and request.task_name
                 else "easy_sales_cleaning")
    env = _get_env(task_name)
    episode = active_episodes.get(task_name, {"actions": []})

    final_quality = env._calculate_quality_score()
    num_actions = len(episode.get("actions", []))
    efficiency = max(0.0, 1.0 - num_actions / 100)
    raw_score = (final_quality * 0.6) + (efficiency * 0.4)

    if final_quality >= env.target_quality:
        raw_score = min(1.0, raw_score + 0.1)

    score = round(max(0.0, min(1.0, raw_score)), 4)

    logger.info(f"[GRADE] task={task_name}  quality={final_quality:.3f}  "
                f"actions={num_actions}  score={score:.3f}")

    return {
        "status": "success",
        "score": score,
        "details": {
            "quality_score": final_quality,
            "target_quality": env.target_quality,
            "num_actions": num_actions,
            "efficiency": round(efficiency, 4),
            "passed": final_quality >= env.target_quality,
        },
    }


@app.get("/tasks")
async def list_tasks():
    """List all available tasks with their schemas."""
    tasks = []
    for name, env in environments.items():
        tasks.append({
            "name": name,
            "difficulty": env.task_difficulty,
            "target_quality": env.target_quality,
            "action_schema": {
                "type": "object",
                "required": ["action_type", "column_name"],
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": ["handle_missing", "detect_anomaly",
                                 "standardize", "validate", "aggregate"],
                    },
                    "column_name": {"type": "string"},
                    "method": {"type": "string", "nullable": True},
                    "value":  {"type": "number", "nullable": True},
                    "threshold": {"type": "number", "nullable": True},
                },
            },
        })
    return {"status": "success", "tasks": tasks}


@app.post("/baseline")
@app.get("/baseline")
async def get_baseline(request: Optional[BaselineRequest] = None):
    """Run heuristic baseline agent and return scores."""
    tasks_to_run = list(environments.keys())
    if request and request.task_name:
        if request.task_name not in environments:
            raise HTTPException(status_code=400,
                                detail=f"Unknown task: {request.task_name}")
        tasks_to_run = [request.task_name]

    results = []
    for task_name in tasks_to_run:
        env = environments[task_name]
        obs = env.reset()
        total_reward = 0.0
        step_count = 0

        for col in obs.missing_columns[:3]:
            try:
                action = CleaningAction(
                    action_type="handle_missing", column_name=col, method="mean"
                )
                obs, reward, done, _ = env.step(action)
                total_reward += reward.immediate_reward
                step_count += 1
                if done:
                    break
            except Exception:
                continue

        final_quality = env._calculate_quality_score()
        results.append({
            "task_name": task_name,
            "steps_taken": step_count,
            "total_reward": round(total_reward, 4),
            "final_quality_score": round(final_quality, 4),
            "success": final_quality >= env.target_quality,
        })

    return {"status": "success", "baseline_scores": results}


# ── NEW: Upload CSV ───────────────────────────────────────────────────────────
@app.post("/upload")
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload a custom CSV file and register it as a new task called 'custom_upload'.
    The uploaded dataset is loaded into the environment as-is.
    Returns the columns found and initial observation.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")

    try:
        contents = await file.read()
        text = contents.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        rows = [row for row in reader]

        if not rows:
            raise HTTPException(status_code=400, detail="CSV file is empty.")

        # Convert numeric strings to numbers where possible
        parsed_rows = []
        for row in rows:
            parsed = {}
            for k, v in row.items():
                if v == "" or v is None:
                    parsed[k] = None
                else:
                    try:
                        parsed[k] = int(v)
                    except ValueError:
                        try:
                            parsed[k] = float(v)
                        except ValueError:
                            parsed[k] = v
            parsed_rows.append(parsed)

        # Build a custom env by injecting the dataset
        env = DataCleaningEnv(task_difficulty="easy")
        env.dataset = parsed_rows
        env.original_dataset = [r.copy() for r in parsed_rows]
        env.target_quality = 0.80
        env.current_row_index = 0
        env.episode_step = 0
        env.max_steps = 200
        env.actions_taken = []
        env.cumulative_reward = 0.0
        env.handled_columns = set()
        env.standardized_columns = set()
        env.anomalies_detected = set()

        environments["custom_upload"] = env
        active_episodes["custom_upload"] = {
            "step": 0, "cumulative_reward": 0.0,
            "actions": [], "observations": [],
        }

        obs = env._get_observation()
        obs.last_action_result = f"Uploaded '{file.filename}' — {len(parsed_rows)} rows, {len(parsed_rows[0])} columns"

        logger.info(f"[UPLOAD] file={file.filename}  rows={len(parsed_rows)}  "
                    f"cols={list(parsed_rows[0].keys())}")

        return {
            "status": "success",
            "task_name": "custom_upload",
            "rows": len(parsed_rows),
            "columns": list(parsed_rows[0].keys()),
            "observation": obs.model_dump(),
        }

    except Exception as e:
        logger.error(f"[UPLOAD] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


# ── NEW: Download cleaned CSV ─────────────────────────────────────────────────
@app.get("/download/{task_name}")
async def download_cleaned_csv(task_name: str):
    """
    Download the current (cleaned) dataset as a CSV file.
    Works for all tasks including 'custom_upload'.
    """
    env = _get_env(task_name)

    if not env.dataset:
        raise HTTPException(status_code=404, detail="No dataset available.")

    output = io.StringIO()
    fieldnames = list(env.dataset[0].keys())
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for row in env.dataset:
        writer.writerow(row)

    output.seek(0)
    safe_name = task_name.replace("/", "_")

    logger.info(f"[DOWNLOAD] task={task_name}  rows={len(env.dataset)}")

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="cleaned_{safe_name}.csv"'
        },
    )


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("Data Cleaning Environment Server — Starting")
    logger.info("=" * 50)
    for task_name, env in environments.items():
        logger.info(f"  ✓  {task_name}  (target={env.target_quality})")
    logger.info("Docs: http://localhost:7860/docs")
    logger.info("=" * 50)

@app.on_event("shutdown")
async def shutdown():
    logger.info("Server shutting down.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
