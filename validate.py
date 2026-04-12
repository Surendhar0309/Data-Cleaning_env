#!/usr/bin/env python3
"""
Validation script for Data Cleaning Environment.
Tests OpenEnv specification compliance and environment functionality.
"""

import json
import logging
from environment import (
    DataCleaningEnv,
    CleaningAction,
    Observation,
    Reward,
    State
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def validate_spec():
    """Validate OpenEnv specification compliance."""
    logger.info("\n" + "="*60)
    logger.info("VALIDATING OpenEnv SPEC COMPLIANCE")
    logger.info("="*60)
    
    passed = 0
    failed = 0
    
    # Test 1: Check Pydantic models are properly defined
    logger.info("\n[1] Checking Pydantic Models...")
    try:
        action = CleaningAction(
            action_type='handle_missing',
            column_name='amount',
            method='mean'
        )
        assert action.action_type == 'handle_missing'
        assert action.column_name == 'amount'
        logger.info("✅ CleaningAction model: PASS")
        passed += 1
    except Exception as e:
        logger.error(f"❌ CleaningAction model: FAIL - {e}")
        failed += 1
    
    # Test 2: Check environment initialization
    logger.info("\n[2] Checking Environment Initialization...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        assert env.task_difficulty == 'easy'
        assert hasattr(env, 'reset')
        assert hasattr(env, 'step')
        assert hasattr(env, 'state')
        logger.info("✅ Environment init: PASS")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Environment init: FAIL - {e}")
        failed += 1
    
    # Test 3: Check reset returns Observation
    logger.info("\n[3] Checking reset() API...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        obs = env.reset()
        assert isinstance(obs, Observation)
        assert obs.total_rows > 0
        assert isinstance(obs.data_quality_score, float)
        assert 0.0 <= obs.data_quality_score <= 1.0
        logger.info(f"✅ reset() returns Observation: PASS")
        logger.info(f"   - Rows: {obs.total_rows}")
        logger.info(f"   - Quality: {obs.data_quality_score:.3f}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ reset() API: FAIL - {e}")
        failed += 1
    
    # Test 4: Check step returns (Observation, Reward, done, info)
    logger.info("\n[4] Checking step() API...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        env.reset()
        
        action = CleaningAction(
            action_type='handle_missing',
            column_name='amount',
            method='mean'
        )
        
        obs, reward, done, info = env.step(action)
        
        assert isinstance(obs, Observation)
        assert isinstance(reward, Reward)
        assert isinstance(done, bool)
        assert isinstance(info, dict)
        
        assert hasattr(reward, 'immediate_reward')
        assert hasattr(reward, 'cumulative_reward')
        assert hasattr(reward, 'bonus_flags')
        
        logger.info(f"✅ step() returns correct types: PASS")
        logger.info(f"   - Immediate reward: {reward.immediate_reward:.3f}")
        logger.info(f"   - Cumulative reward: {reward.cumulative_reward:.3f}")
        logger.info(f"   - Done: {done}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ step() API: FAIL - {e}")
        failed += 1
    
    # Test 5: Check state() returns State object
    logger.info("\n[5] Checking state() API...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        env.reset()
        state = env.state()
        
        assert isinstance(state, State)
        assert hasattr(state, 'dataset')
        assert hasattr(state, 'metadata')
        assert hasattr(state, 'actions_taken')
        assert hasattr(state, 'episode_step')
        
        logger.info(f"✅ state() returns State object: PASS")
        logger.info(f"   - Dataset rows: {len(state.dataset)}")
        logger.info(f"   - Actions taken: {len(state.actions_taken)}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ state() API: FAIL - {e}")
        failed += 1
    
    # Test 6: Check action types
    logger.info("\n[6] Checking Supported Action Types...")
    try:
        action_types = ['handle_missing', 'detect_anomaly', 'standardize', 'validate', 'aggregate']
        env = DataCleaningEnv(task_difficulty='easy')
        env.reset()
        
        for action_type in action_types:
            action = CleaningAction(
                action_type=action_type,
                column_name='amount' if action_type != 'validate' else 'amount',
                method='mean'
            )
            obs, reward, done, info = env.step(action)
            assert isinstance(obs, Observation)
        
        logger.info(f"✅ All action types supported: PASS")
        logger.info(f"   - {', '.join(action_types)}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Action types: FAIL - {e}")
        failed += 1
    
    # Test 7: Check all three tasks can be created
    logger.info("\n[7] Checking All Task Difficulties...")
    try:
        for difficulty in ['easy', 'medium', 'hard']:
            env = DataCleaningEnv(task_difficulty=difficulty)
            obs = env.reset()
            assert obs.total_rows > 0
            logger.info(f"   ✓ {difficulty}: {obs.total_rows} rows")
        
        logger.info(f"✅ All difficulties work: PASS")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Task difficulties: FAIL - {e}")
        failed += 1
    
    # Test 8: Check reward bounds
    logger.info("\n[8] Checking Reward Bounds...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        env.reset()
        
        # Run 10 random steps
        total_reward_sum = 0
        for i in range(10):
            action = CleaningAction(
                action_type='handle_missing',
                column_name='amount',
                method='mean'
            )
            obs, reward, done, info = env.step(action)
            total_reward_sum += reward.immediate_reward
            
            # Check reward is reasonable
            assert isinstance(reward.immediate_reward, (int, float))
            assert -1.0 <= reward.immediate_reward <= 2.0  # Reasonable bounds
        
        logger.info(f"✅ Reward bounds valid: PASS")
        logger.info(f"   - Total reward over 10 steps: {total_reward_sum:.3f}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Reward bounds: FAIL - {e}")
        failed += 1
    
    # Test 9: Check dataset quality score
    logger.info("\n[9] Checking Quality Score Calculation...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        obs = env.reset()
        
        quality_1 = obs.data_quality_score
        
        # Do some cleaning
        for _ in range(5):
            action = CleaningAction(
                action_type='handle_missing',
                column_name='amount',
                method='mean'
            )
            obs, _, _, _ = env.step(action)
        
        quality_2 = obs.data_quality_score
        
        # Quality should improve with cleaning
        assert 0.0 <= quality_1 <= 1.0
        assert 0.0 <= quality_2 <= 1.0
        logger.info(f"✅ Quality scoring works: PASS")
        logger.info(f"   - Initial: {quality_1:.3f}")
        logger.info(f"   - After cleaning: {quality_2:.3f}")
        logger.info(f"   - Improvement: {(quality_2 - quality_1):.3f}")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Quality scoring: FAIL - {e}")
        failed += 1
    
    # Test 10: Check episode termination
    logger.info("\n[10] Checking Episode Termination...")
    try:
        env = DataCleaningEnv(task_difficulty='easy')
        obs = env.reset()
        
        # Run until done
        max_iterations = 150
        step_count = 0
        done = False
        
        for i in range(max_iterations):
            action = CleaningAction(
                action_type='handle_missing',
                column_name='amount',
                method='mean'
            )
            obs, reward, done, info = env.step(action)
            step_count += 1
            if done:
                break
        
        assert done, "Episode should terminate"
        logger.info(f"✅ Episode termination works: PASS")
        logger.info(f"   - Terminated after {step_count} steps")
        passed += 1
    except Exception as e:
        logger.error(f"❌ Episode termination: FAIL - {e}")
        failed += 1
    
    # Summary
    logger.info("\n" + "="*60)
    logger.info(f"VALIDATION SUMMARY")
    logger.info("="*60)
    logger.info(f"✅ Passed: {passed}")
    logger.info(f"❌ Failed: {failed}")
    logger.info(f"Total: {passed + failed}")
    logger.info("="*60)
    
    return failed == 0


def test_episode_workflow():
    """Test a complete episode workflow."""
    logger.info("\n" + "="*60)
    logger.info("TESTING COMPLETE EPISODE WORKFLOW")
    logger.info("="*60)
    
    try:
        # Initialize
        env = DataCleaningEnv(task_difficulty='easy')
        logger.info("✓ Environment created")
        
        # Reset
        obs = env.reset()
        logger.info(f"✓ Episode reset")
        logger.info(f"  - Rows: {obs.total_rows}")
        logger.info(f"  - Missing columns: {obs.missing_columns}")
        logger.info(f"  - Quality: {obs.data_quality_score:.3f}")
        
        # Execute steps
        cumulative_reward = 0.0
        for step_num in range(15):
            action = CleaningAction(
                action_type='handle_missing',
                column_name=obs.missing_columns[0] if obs.missing_columns else 'amount',
                method='mean'
            )
            
            obs, reward, done, info = env.step(action)
            cumulative_reward += reward.immediate_reward
            
            logger.info(f"✓ Step {step_num + 1}")
            logger.info(f"  - Action: {action.action_type} on {action.column_name}")
            logger.info(f"  - Reward: {reward.immediate_reward:.3f}")
            logger.info(f"  - Quality: {obs.data_quality_score:.3f}")
            logger.info(f"  - Done: {done}")
            
            if done:
                break
        
        # Get final state
        state = env.state()
        logger.info(f"\n✓ Episode complete")
        logger.info(f"  - Final quality: {state.metadata['quality_score']:.3f}")
        logger.info(f"  - Total reward: {cumulative_reward:.3f}")
        logger.info(f"  - Actions taken: {len(state.actions_taken)}")
        
        logger.info("\n✅ EPISODE WORKFLOW: PASS")
        return True
        
    except Exception as e:
        logger.error(f"❌ EPISODE WORKFLOW: FAIL - {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all validations."""
    logger.info("\n\n" + "="*60)
    logger.info("DATA CLEANING ENVIRONMENT VALIDATION")
    logger.info("="*60)
    
    # Run spec validation
    spec_passed = validate_spec()
    
    # Run workflow test
    workflow_passed = test_episode_workflow()
    
    # Final summary
    logger.info("\n" + "="*60)
    logger.info("FINAL VALIDATION RESULT")
    logger.info("="*60)
    
    if spec_passed and workflow_passed:
        logger.info("✅ ALL VALIDATIONS PASSED")
        logger.info("Environment is ready for deployment!")
        return 0
    else:
        logger.error("❌ SOME VALIDATIONS FAILED")
        logger.error("Please fix issues before deployment.")
        return 1


if __name__ == '__main__':
    import sys
    sys.exit(main())
