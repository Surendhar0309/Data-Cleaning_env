"""
FastAPI server for Data Cleaning Environment.
Implements OpenEnv standard endpoints: reset, step, state, baseline, grader, tasks.
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import logging

from environment import DataCleaningEnv, CleaningAction, Observation, Reward, State

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Data Cleaning & Analytics Environment",
    description="An OpenEnv-compliant environment for data cleaning tasks",
    version="1.0.0"
)

environments = {
    'easy_sales_cleaning': DataCleaningEnv(task_difficulty='easy'),
    'medium_customer_cleaning': DataCleaningEnv(task_difficulty='medium'),
    'hard_survey_analytics': DataCleaningEnv(task_difficulty='hard'),
}

active_episodes: Dict[str, Dict[str, Any]] = {}


class ResetRequest(BaseModel):
    task_name: Optional[str] = 'easy_sales_cleaning'

class StepRequest(BaseModel):
    task_name: str = 'easy_sales_cleaning'
    action: CleaningAction

class StateRequest(BaseModel):
    task_name: Optional[str] = 'easy_sales_cleaning'

class BaselineRequest(BaseModel):
    task_name: Optional[str] = None

class GraderRequest(BaseModel):
    task_name: Optional[str] = 'easy_sales_cleaning'
    episode_data: Optional[Dict[str, Any]] = {}


@app.get("/")
async def health_check():
    return {
        "status": "healthy",
        "service": "Data Cleaning & Analytics Environment",
        "version": "1.0.0",
        "available_tasks": list(environments.keys())
    }


@app.post("/reset")
async def reset(request: Optional[ResetRequest] = None):
    """Reset - accepts POST with no body OR with task_name."""
    task_name = 'easy_sales_cleaning'
    if request and request.task_name:
        task_name = request.task_name

    if task_name not in environments:
        raise HTTPException(status_code=400, detail=f"Unknown task: {task_name}")

    env = environments[task_name]
    observation = env.reset()

    active_episodes[task_name] = {
        'step': 0, 'cumulative_reward': 0.0,
        'actions': [], 'observations': [observation.model_dump()],
    }

    return {
        "status": "success",
        "observation": observation.model_dump(),
        "episode_id": task_name
    }


@app.post("/step")
async def step(request: StepRequest):
    task_name = request.task_name
    if task_name not in environments:
        raise HTTPException(status_code=400, detail=f"Unknown task: {task_name}")

    if task_name not in active_episodes:
        env = environments[task_name]
        observation = env.reset()
        active_episodes[task_name] = {'step': 0, 'cumulative_reward': 0.0, 'actions': [], 'observations': [observation.model_dump()]}

    env = environments[task_name]
    try:
        observation, reward, done, info = env.step(request.action)
        episode = active_episodes[task_name]
        episode['step'] += 1
        episode['cumulative_reward'] += reward.immediate_reward
        episode['actions'].append(request.action.model_dump())
        return {"status": "success", "observation": observation.model_dump(), "reward": reward.model_dump(), "done": done, "info": info, "step": episode['step']}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/state")
@app.get("/state")
async def get_state(request: Optional[StateRequest] = None):
    task_name = 'easy_sales_cleaning'
    if request and request.task_name:
        task_name = request.task_name
    if task_name not in environments:
        raise HTTPException(status_code=400, detail=f"Unknown task: {task_name}")
    return {"status": "success", "state": environments[task_name].state().model_dump()}


@app.post("/grader")
@app.get("/grader")
async def grade_episode(request: Optional[GraderRequest] = None):
    task_name = 'easy_sales_cleaning'
    if request and request.task_name:
        task_name = request.task_name
    env = environments.get(task_name, environments['easy_sales_cleaning'])
    episode = active_episodes.get(task_name, {'actions': []})
    final_quality = env._calculate_quality_score()
    num_actions = len(episode.get('actions', []))
    raw_score = (final_quality * 0.6) + ((1.0 - num_actions/100) * 0.4)
    if final_quality >= env.target_quality:
        raw_score = min(1.0, raw_score + 0.1)
    return {"status": "success", "score": max(0.0, min(1.0, raw_score)), "details": {"quality_score": final_quality, "target_quality": env.target_quality}}


@app.get("/tasks")
async def list_tasks():
    tasks = []
    for name, env in environments.items():
        tasks.append({
            "name": name,
            "difficulty": env.task_difficulty,
            "target_quality": env.target_quality,
            "action_schema": {
                "type": "object",
                "properties": {
                    "action_type": {"type": "string", "enum": ["handle_missing", "detect_anomaly", "standardize", "validate", "aggregate"]},
                    "column_name": {"type": "string"},
                    "method": {"type": "string"},
                    "value": {"type": "number"},
                    "threshold": {"type": "number"}
                },
                "required": ["action_type", "column_name"]
            }
        })
    return {"status": "success", "tasks": tasks}


@app.post("/baseline")
@app.get("/baseline")
async def get_baseline(request: Optional[BaselineRequest] = None):
    tasks_to_run = list(environments.keys())
    if request and request.task_name:
        tasks_to_run = [request.task_name]

    results = []
    for task_name in tasks_to_run:
        if task_name not in environments:
            continue
        env = environments[task_name]
        obs = env.reset()
        total_reward = 0.0
        step_count = 0
        for col in obs.missing_columns[:3]:
            try:
                action = CleaningAction(action_type='handle_missing', column_name=col, method='mean')
                obs, reward, done, _ = env.step(action)
                total_reward += reward.immediate_reward
                step_count += 1
                if done: break
            except: continue
        final_quality = env._calculate_quality_score()
        results.append({"task_name": task_name, "steps_taken": step_count, "final_quality_score": final_quality, "success": final_quality >= env.target_quality})

    return {"status": "success", "baseline_scores": results}


@app.on_event("startup")
async def startup():
    logger.info("Data Cleaning Environment Server Starting...")
    for task_name in environments:
        logger.info(f"  - {task_name}: Ready")

@app.on_event("shutdown")
async def shutdown():
    logger.info("Shutting down...")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
