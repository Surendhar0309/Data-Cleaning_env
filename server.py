"""
FastAPI server for Data Cleaning Environment.
Implements OpenEnv standard endpoints: reset, step, state, baseline, grader, tasks.

KEY ADDITION: CORSMiddleware — required so the GitHub Pages webapp
can call this API without being blocked by the browser.
"""

import os
import logging
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
# Allows the GitHub Pages webapp (and any other origin) to call this API.
# For production you can restrict allow_origins to your exact domain, e.g.:
#   ["https://surendhar0309.github.io"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # allow all origins
    allow_credentials=True,
    allow_methods=["*"],          # GET, POST, OPTIONS, etc.
    allow_headers=["*"],          # Content-Type, Authorization, etc.
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
        raise HTTPException(status_code=400, detail=f"Unknown task: '{task_name}'. "
                            f"Valid tasks: {list(environments.keys())}")
    return environments[task_name]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def health_check():
    """Health check — also used by the webapp to detect if the server is online."""
    return {
        "status": "healthy",
        "service": "Data Cleaning & Analytics Environment",
        "version": "1.0.0",
        "available_tasks": list(environments.keys()),
    }


@app.post("/reset")
async def reset(request: Optional[ResetRequest] = None):
    """Reset the environment for a given task and return the initial observation."""
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
    """Execute one cleaning action and return the next observation + reward."""
    env = _get_env(request.task_name)

    # Auto-reset if no active episode
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
    """Return the full current environment state (dataset + metadata + history)."""
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

    # Bonus for reaching target quality
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
    """Run the heuristic baseline agent and return scores."""
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


# ── Lifecycle ─────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("=" * 50)
    logger.info("Data Cleaning Environment Server — Starting")
    logger.info("=" * 50)
    for task_name, env in environments.items():
        logger.info(f"  ✓  {task_name}  (target={env.target_quality})")
    logger.info("Docs available at: http://localhost:7860/docs")
    logger.info("=" * 50)

@app.on_event("shutdown")
async def shutdown():
    logger.info("Server shutting down.")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
