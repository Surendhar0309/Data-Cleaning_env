#!/usr/bin/env python3
"""
Baseline Inference Script for Data Cleaning Environment.

This script demonstrates how to use the OpenAI API to solve data cleaning tasks
in the Data Cleaning & Analytics environment.

Usage:
    python baseline_inference.py

Environment:
    - Requires OPENAI_API_KEY environment variable
    - Alternatively uses ANTHROPIC_API_KEY or claude API key
"""

import os
import json
import time
from typing import Optional, Dict, Any, List
import logging

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Import environment (for local testing)
try:
    from environment import DataCleaningEnv, CleaningAction
except ImportError:
    logger.warning("Could not import local environment - will use API endpoints instead")
    DataCleaningEnv = None
    CleaningAction = None


class BaselineAgent:
    """A baseline agent that uses heuristic rules to clean data."""
    
    def __init__(self, use_api: bool = False, api_url: str = "http://localhost:7860"):
        """Initialize the baseline agent.
        
        Args:
            use_api: If True, use HTTP API; if False, use local environment
            api_url: Base URL for API endpoints
        """
        self.use_api = use_api
        self.api_url = api_url
        self.session_id = None
        
        if use_api:
            import requests
            self.requests = requests
        else:
            self.environments = {
                'easy_sales_cleaning': DataCleaningEnv(task_difficulty='easy'),
                'medium_customer_cleaning': DataCleaningEnv(task_difficulty='medium'),
                'hard_survey_analytics': DataCleaningEnv(task_difficulty='hard'),
            }
    
    def reset(self, task_name: str) -> Optional[Dict[str, Any]]:
        """Reset environment for a task."""
        if self.use_api:
            try:
                resp = self.requests.post(
                    f"{self.api_url}/reset",
                    json={"task_name": task_name}
                )
                resp.raise_for_status()
                data = resp.json()
                self.session_id = task_name
                return data.get("observation")
            except Exception as e:
                logger.error(f"API reset failed: {e}")
                return None
        else:
            if task_name not in self.environments:
                logger.error(f"Unknown task: {task_name}")
                return None
            obs = self.environments[task_name].reset()
            self.current_env = self.environments[task_name]
            return obs.model_dump() if hasattr(obs, 'model_dump') else obs
    
    def step(self, task_name: str, action_dict: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Execute a step in the environment."""
        if self.use_api:
            try:
                resp = self.requests.post(
                    f"{self.api_url}/step",
                    json={
                        "task_name": task_name,
                        "action": action_dict
                    }
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"API step failed: {e}")
                return None
        else:
            try:
                action = CleaningAction(**action_dict)
                obs, reward, done, info = self.current_env.step(action)
                return {
                    "observation": obs.model_dump() if hasattr(obs, 'model_dump') else obs,
                    "reward": reward.model_dump() if hasattr(reward, 'model_dump') else reward,
                    "done": done,
                    "info": info
                }
            except Exception as e:
                logger.error(f"Step failed: {e}")
                return None
    
    def get_state(self, task_name: str) -> Optional[Dict[str, Any]]:
        """Get current state."""
        if self.use_api:
            try:
                resp = self.requests.post(
                    f"{self.api_url}/state",
                    json={"task_name": task_name}
                )
                resp.raise_for_status()
                data = resp.json()
                return data.get("state")
            except Exception as e:
                logger.error(f"API get_state failed: {e}")
                return None
        else:
            state = self.current_env.state()
            return state.model_dump() if hasattr(state, 'model_dump') else state
    
    def grade_episode(self, task_name: str) -> Optional[Dict[str, Any]]:
        """Grade the completed episode."""
        if self.use_api:
            try:
                state = self.get_state(task_name)
                resp = self.requests.post(
                    f"{self.api_url}/grader",
                    json={
                        "task_name": task_name,
                        "episode_data": state or {}
                    }
                )
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.error(f"API grade_episode failed: {e}")
                return None
        else:
            # Local grading
            final_quality = self.current_env._calculate_quality_score()
            return {
                "score": final_quality,
                "details": {
                    "quality_score": final_quality,
                    "target_quality": self.current_env.target_quality,
                }
            }
    
    def run_episode(self, task_name: str, max_steps: int = 50) -> Dict[str, Any]:
        """Run a complete episode on a task using heuristic strategy."""
        logger.info(f"\n{'='*60}")
        logger.info(f"Starting episode for task: {task_name}")
        logger.info(f"{'='*60}")
        
        # Reset
        observation = self.reset(task_name)
        if observation is None:
            logger.error("Failed to reset environment")
            return {"success": False, "error": "Reset failed"}
        
        logger.info(f"Initial quality score: {observation.get('data_quality_score', 'N/A'):.3f}")
        logger.info(f"Missing columns: {observation.get('missing_columns', [])}")
        
        # Heuristic action sequence
        actions = self._generate_action_sequence(task_name, observation)
        
        step_count = 0
        total_reward = 0.0
        
        for action_dict in actions:
            if step_count >= max_steps:
                logger.info(f"Reached max steps limit ({max_steps})")
                break
            
            logger.info(f"\nStep {step_count + 1}: {action_dict['action_type']} on '{action_dict['column_name']}'")
            if action_dict.get('method'):
                logger.info(f"  Method: {action_dict['method']}")
            
            result = self.step(task_name, action_dict)
            if result is None:
                logger.warning("Step failed, continuing...")
                continue
            
            obs = result.get('observation', {})
            reward = result.get('reward', {})
            done = result.get('done', False)
            
            immediate_reward = reward.get('immediate_reward', 0.0)
            total_reward += immediate_reward
            
            logger.info(f"  Reward: {immediate_reward:.3f} | Quality: {obs.get('data_quality_score', 0.0):.3f}")
            
            step_count += 1
            
            if done:
                logger.info("Episode terminated")
                break
        
        # Grade the episode
        grade_result = self.grade_episode(task_name)
        final_score = grade_result.get('score', 0.0) if grade_result else 0.0
        
        logger.info(f"\n{'='*60}")
        logger.info(f"Episode Summary:")
        logger.info(f"  Task: {task_name}")
        logger.info(f"  Steps: {step_count}/{max_steps}")
        logger.info(f"  Total Reward: {total_reward:.3f}")
        logger.info(f"  Final Score: {final_score:.3f}")
        logger.info(f"  Success: {final_score >= 0.7}")
        logger.info(f"{'='*60}\n")
        
        return {
            "task_name": task_name,
            "steps_taken": step_count,
            "total_reward": total_reward,
            "final_score": final_score,
            "success": final_score >= 0.7,
        }
    
    def _generate_action_sequence(self, task_name: str, observation: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate a heuristic action sequence based on observed data issues."""
        actions = []
        
        missing_cols = observation.get('missing_columns', [])
        
        # Strategy 1: Handle missing values with mean imputation
        for col in missing_cols[:4]:
            if col in ['amount', 'quantity', 'age', 'ltv', 'satisfaction', 'nps_score', 'rating']:
                actions.append({
                    'action_type': 'handle_missing',
                    'column_name': col,
                    'method': 'mean',
                })
            else:
                actions.append({
                    'action_type': 'handle_missing',
                    'column_name': col,
                    'method': 'delete',
                })
        
        # Strategy 2: Detect and fix anomalies
        numeric_cols = ['amount', 'quantity', 'age', 'ltv', 'satisfaction', 'nps_score', 'rating', 'completion_time_sec']
        for col in numeric_cols:
            if col not in missing_cols:
                actions.append({
                    'action_type': 'detect_anomaly',
                    'column_name': col,
                    'threshold': 2.5,
                })
        
        # Strategy 3: Standardize text columns
        text_cols = ['status', 'category', 'country', 'device', 'name', 'email']
        for col in text_cols:
            if col not in missing_cols:
                if col in ['status', 'category', 'country']:
                    actions.append({
                        'action_type': 'standardize',
                        'column_name': col,
                        'method': 'lowercase',
                    })
                elif col in ['name']:
                    actions.append({
                        'action_type': 'standardize',
                        'column_name': col,
                        'method': 'title_case',
                    })
                elif col in ['device']:
                    actions.append({
                        'action_type': 'standardize',
                        'column_name': col,
                        'method': 'lowercase',
                    })
        
        # Strategy 4: Validate columns
        for col in missing_cols[:3]:
            actions.append({
                'action_type': 'validate',
                'column_name': col,
            })
        
        return actions


def main():
    """Main entry point."""
    import sys
    
    logger.info("Data Cleaning Environment - Baseline Inference Script")
    logger.info(f"Python: {sys.version}")
    logger.info(f"Working directory: {os.getcwd()}")
    
    # Check for API key
    api_key = os.getenv('OPENAI_API_KEY') or os.getenv('ANTHROPIC_API_KEY')
    
    # Determine if we should use API or local environment
    use_api = not (DataCleaningEnv is not None and CleaningAction is not None)
    
    if use_api:
        logger.info("Using API endpoints (local environment not available)")
    else:
        logger.info("Using local environment")
    
    # Create agent
    agent = BaselineAgent(use_api=use_api)
    
    # Define tasks to run
    tasks = [
        'easy_sales_cleaning',
        'medium_customer_cleaning',
        'hard_survey_analytics',
    ]
    
    # Run episodes
    results = []
    for task in tasks:
        try:
            result = agent.run_episode(task, max_steps=60)
            results.append(result)
            time.sleep(0.5)  # Brief pause between tasks
        except Exception as e:
            logger.error(f"Task {task} failed with error: {e}")
            results.append({
                "task_name": task,
                "success": False,
                "error": str(e)
            })
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info("BASELINE RESULTS SUMMARY")
    logger.info("="*60)
    
    total_score = 0.0
    successful = 0
    
    for result in results:
        task = result.get('task_name', 'unknown')
        score = result.get('final_score', 0.0)
        success = result.get('success', False)
        
        logger.info(f"\n{task}:")
        logger.info(f"  Score: {score:.3f}")
        logger.info(f"  Success: {success}")
        
        if success:
            successful += 1
            total_score += score
    
    avg_score = total_score / max(1, successful) if successful > 0 else 0.0
    logger.info(f"\n{'='*60}")
    logger.info(f"Tasks Passed: {successful}/{len(tasks)}")
    logger.info(f"Average Score: {avg_score:.3f}")
    logger.info(f"{'='*60}\n")
    
    # Save results to file
    output_file = 'baseline_results.json'
    with open(output_file, 'w') as f:
        json.dump({
            'results': results,
            'summary': {
                'tasks_passed': successful,
                'total_tasks': len(tasks),
                'average_score': avg_score,
            }
        }, f, indent=2)
    
    logger.info(f"Results saved to {output_file}")
    
    return 0 if successful == len(tasks) else 1


if __name__ == '__main__':
    import sys
    sys.exit(main())
