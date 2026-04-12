"""
Data Cleaning and Analytics Environment

A real-world OpenEnv environment where agents learn to clean messy datasets,
handle missing values, detect anomalies, and prepare data for analysis.
"""

import json
import random
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from pydantic import BaseModel, Field


# ============================================================================
# Pydantic Models (OpenEnv Spec Compliance)
# ============================================================================

class CleaningAction(BaseModel):
    """Action schema for data cleaning operations."""
    
    action_type: str = Field(
        ..., 
        description="Type of cleaning action: 'handle_missing', 'detect_anomaly', 'standardize', 'validate', 'aggregate'"
    )
    column_name: str = Field(..., description="Target column for the action")
    method: Optional[str] = Field(
        None, 
        description="Method for handling (e.g., 'mean', 'median', 'delete', 'zscore', 'minmax')"
    )
    value: Optional[float] = Field(None, description="Optional value for manual imputation")
    threshold: Optional[float] = Field(None, description="Threshold for anomaly detection")


class Observation(BaseModel):
    """Observation of the current dataset state."""
    
    current_row_index: int = Field(..., description="Current row being processed")
    total_rows: int = Field(..., description="Total number of rows in dataset")
    missing_columns: List[str] = Field(..., description="Columns with missing values")
    anomaly_columns: List[str] = Field(..., description="Columns with detected anomalies")
    standardized_columns: List[str] = Field(..., description="Already standardized columns")
    data_quality_score: float = Field(..., description="Current data quality (0.0-1.0)")
    last_action_result: str = Field(..., description="Result of last action")
    completion_percentage: float = Field(..., description="Overall task completion %")


class Reward(BaseModel):
    """Reward signal for the episode."""
    
    immediate_reward: float = Field(..., description="Reward for this step")
    cumulative_reward: float = Field(..., description="Total reward so far")
    bonus_flags: Dict[str, bool] = Field(..., description="Achievement flags")


class State(BaseModel):
    """Complete state of the environment."""
    
    dataset: List[Dict[str, Any]] = Field(..., description="Current dataset state")
    metadata: Dict[str, Any] = Field(..., description="Dataset metadata")
    actions_taken: List[Dict[str, Any]] = Field(..., description="History of actions")
    episode_step: int = Field(..., description="Current step in episode")


# ============================================================================
# Dataset Generators
# ============================================================================

class DatasetGenerator:
    """Generate realistic messy datasets with various quality issues."""
    
    def __init__(self, seed: int = 42):
        random.seed(seed)
        np.random.seed(seed)
    
    def generate_sales_data(self, num_rows: int = 50) -> List[Dict[str, Any]]:
        """Generate sales dataset with missing values, outliers, and inconsistencies."""
        data = []
        
        for i in range(num_rows):
            row = {
                'transaction_id': f'TXN_{i:05d}',
                'customer_id': f'CUST_{random.randint(1000, 5000)}',
                'amount': round(random.uniform(10, 1000), 2) if random.random() > 0.15 else None,
                'quantity': random.randint(1, 100) if random.random() > 0.1 else None,
                'date': f'2024-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
                'category': random.choice(['Electronics', 'Clothing', 'Food', 'Books', None]) if random.random() > 0.1 else None,
                'status': random.choice(['completed', 'pending', 'cancelled', 'COMPLETED', 'Pending', None]),
            }
            
            # Introduce outliers
            if random.random() < 0.05 and row['amount'] is not None:
                row['amount'] = row['amount'] * random.uniform(5, 20)  # 5-20x outlier
            
            data.append(row)
        
        return data
    
    def generate_customer_data(self, num_rows: int = 50) -> List[Dict[str, Any]]:
        """Generate customer dataset with inconsistent formats."""
        data = []
        
        for i in range(num_rows):
            row = {
                'customer_id': f'CUST_{random.randint(1000, 9999)}',
                'name': random.choice(['John Smith', 'jane doe', 'JOHN SMITH', 'Jane Doe', None]),
                'age': random.randint(18, 80) if random.random() > 0.12 else None,
                'email': f'user{i}@example.com' if random.random() > 0.08 else None,
                'signup_date': f'2023-{random.randint(1,12):02d}-{random.randint(1,28):02d}',
                'ltv': round(random.uniform(100, 5000), 2) if random.random() > 0.1 else None,
                'country': random.choice(['USA', 'usa', 'US', 'Canada', 'CAN', None]),
            }
            
            # Introduce invalid ages
            if random.random() < 0.03 and row['age'] is not None:
                row['age'] = random.choice([999, -5, 150])
            
            data.append(row)
        
        return data
    
    def generate_survey_data(self, num_rows: int = 50) -> List[Dict[str, Any]]:
        """Generate survey response dataset."""
        data = []
        
        for i in range(num_rows):
            row = {
                'response_id': f'RESP_{i:05d}',
                'satisfaction': random.randint(1, 5) if random.random() > 0.1 else None,
                'nps_score': random.randint(-100, 100) if random.random() > 0.12 else None,
                'review_length': random.randint(10, 500) if random.random() > 0.15 else None,
                'rating': round(random.uniform(1, 5), 1) if random.random() > 0.1 else None,
                'completion_time_sec': random.randint(30, 600) if random.random() > 0.08 else None,
                'device': random.choice(['mobile', 'desktop', 'tablet', 'MOBILE', 'Desktop', None]),
            }
            
            # Introduce impossible values
            if random.random() < 0.04:
                row['satisfaction'] = random.choice([0, 6, -1, 999])
            
            data.append(row)
        
        return data


# ============================================================================
# Data Cleaning Environment
# ============================================================================

class DataCleaningEnv:
    """OpenEnv-compliant data cleaning environment."""
    
    def __init__(self, task_difficulty: str = 'easy'):
        """Initialize the environment.
        
        Args:
            task_difficulty: 'easy', 'medium', or 'hard'
        """
        self.task_difficulty = task_difficulty
        self.generator = DatasetGenerator()
        self.reset()
    
    def reset(self) -> Observation:
        """Reset the environment and start a new episode."""
        # Select dataset based on difficulty
        if self.task_difficulty == 'easy':
            self.dataset = self.generator.generate_sales_data(num_rows=30)
            self.original_dataset = [row.copy() for row in self.dataset]
            self.target_quality = 0.85
        elif self.task_difficulty == 'medium':
            self.dataset = self.generator.generate_customer_data(num_rows=40)
            self.original_dataset = [row.copy() for row in self.dataset]
            self.target_quality = 0.80
        else:  # hard
            self.dataset = self.generator.generate_survey_data(num_rows=50)
            self.original_dataset = [row.copy() for row in self.dataset]
            self.target_quality = 0.75
        
        self.current_row_index = 0
        self.episode_step = 0
        self.max_steps = 100
        self.actions_taken = []
        self.cumulative_reward = 0.0
        self.handled_columns = set()
        self.standardized_columns = set()
        self.anomalies_detected = set()
        
        return self._get_observation()
    
    def step(self, action: CleaningAction) -> Tuple[Observation, Reward, bool, Dict[str, Any]]:
        """Execute a cleaning action."""
        self.episode_step += 1
        done = self.episode_step >= self.max_steps
        immediate_reward = 0.0
        action_result = "action_executed"
        bonus_flags = {}
        
        try:
            action_dict = action.model_dump()
            self.actions_taken.append(action_dict)
            
            # Handle missing values
            if action_dict['action_type'] == 'handle_missing':
                immediate_reward, msg = self._handle_missing(
                    action_dict['column_name'],
                    action_dict.get('method'),
                    action_dict.get('value')
                )
                action_result = msg
            
            # Detect anomalies
            elif action_dict['action_type'] == 'detect_anomaly':
                immediate_reward, msg = self._detect_anomaly(
                    action_dict['column_name'],
                    action_dict.get('threshold', 2.0)
                )
                action_result = msg
                if immediate_reward > 0:
                    bonus_flags['anomaly_detected'] = True
            
            # Standardize column
            elif action_dict['action_type'] == 'standardize':
                immediate_reward, msg = self._standardize_column(
                    action_dict['column_name'],
                    action_dict.get('method', 'lowercase')
                )
                action_result = msg
                if immediate_reward > 0:
                    bonus_flags['column_standardized'] = True
            
            # Validate data
            elif action_dict['action_type'] == 'validate':
                immediate_reward, msg = self._validate_data(action_dict['column_name'])
                action_result = msg
                if immediate_reward > 0:
                    bonus_flags['validation_passed'] = True
            
            # Aggregate data
            elif action_dict['action_type'] == 'aggregate':
                immediate_reward, msg = self._aggregate_data(action_dict['column_name'])
                action_result = msg
            
            else:
                action_result = "Unknown action type"
                immediate_reward = -0.1
        
        except Exception as e:
            action_result = f"Error: {str(e)}"
            immediate_reward = -0.2
        
        # Add step penalty to encourage efficiency
        immediate_reward -= 0.01
        
        # Bonus for completing task well
        current_quality = self._calculate_quality_score()
        if current_quality >= self.target_quality and len(self.handled_columns) > 0:
            bonus_flags['task_complete'] = True
            if not hasattr(self, '_task_complete_bonus_given'):
                immediate_reward += 1.0
                self._task_complete_bonus_given = True
        
        self.cumulative_reward += immediate_reward
        
        observation = self._get_observation()
        observation.last_action_result = action_result
        
        info = {
            'task_difficulty': self.task_difficulty,
            'quality_score': current_quality,
            'columns_handled': list(self.handled_columns),
            'anomalies_found': list(self.anomalies_detected),
        }
        
        reward = Reward(
            immediate_reward=immediate_reward,
            cumulative_reward=self.cumulative_reward,
            bonus_flags=bonus_flags
        )
        
        return observation, reward, done, info
    
    def state(self) -> State:
        """Return complete state of the environment."""
        return State(
            dataset=self.dataset,
            metadata={
                'num_rows': len(self.dataset),
                'num_columns': len(self.dataset[0]) if self.dataset else 0,
                'quality_score': self._calculate_quality_score(),
                'task_difficulty': self.task_difficulty,
            },
            actions_taken=self.actions_taken,
            episode_step=self.episode_step
        )
    
    # ========================================================================
    # Action Implementation
    # ========================================================================
    
    def _handle_missing(self, column: str, method: Optional[str], value: Optional[float]) -> Tuple[float, str]:
        """Handle missing values in a column."""
        if not self.dataset or column not in self.dataset[0]:
            return -0.1, f"Column '{column}' not found"
        
        missing_count = sum(1 for row in self.dataset if row.get(column) is None)
        if missing_count == 0:
            return 0.0, f"No missing values in '{column}'"
        
        if method == 'mean':
            values = [row[column] for row in self.dataset if row[column] is not None 
                     and isinstance(row[column], (int, float))]
            if values:
                mean_val = sum(values) / len(values)
                for row in self.dataset:
                    if row.get(column) is None:
                        row[column] = mean_val
                self.handled_columns.add(column)
                return 0.3, f"Filled {missing_count} missing values in '{column}' with mean"
        
        elif method == 'median':
            values = sorted([row[column] for row in self.dataset if row[column] is not None 
                           and isinstance(row[column], (int, float))])
            if values:
                median_val = values[len(values) // 2]
                for row in self.dataset:
                    if row.get(column) is None:
                        row[column] = median_val
                self.handled_columns.add(column)
                return 0.3, f"Filled {missing_count} missing values in '{column}' with median"
        
        elif method == 'delete':
            self.dataset = [row for row in self.dataset if row.get(column) is not None]
            self.handled_columns.add(column)
            return 0.25, f"Deleted {missing_count} rows with missing '{column}' (now {len(self.dataset)} rows)"
        
        elif method == 'forward_fill':
            for i in range(len(self.dataset)):
                if self.dataset[i].get(column) is None and i > 0:
                    self.dataset[i][column] = self.dataset[i-1].get(column)
            self.handled_columns.add(column)
            return 0.3, f"Forward-filled missing values in '{column}'"
        
        elif value is not None:
            for row in self.dataset:
                if row.get(column) is None:
                    row[column] = value
            self.handled_columns.add(column)
            return 0.25, f"Filled {missing_count} missing values in '{column}' with {value}"
        
        return -0.1, "No valid method specified"
    
    def _detect_anomaly(self, column: str, threshold: float) -> Tuple[float, str]:
        """Detect anomalies using z-score method."""
        if column not in self.dataset[0]:
            return -0.1, f"Column '{column}' not found"
        
        values = [row[column] for row in self.dataset if row[column] is not None 
                 and isinstance(row[column], (int, float))]
        
        if len(values) < 2:
            return 0.0, f"Not enough numeric values in '{column}' to detect anomalies"
        
        mean = sum(values) / len(values)
        variance = sum((x - mean) ** 2 for x in values) / len(values)
        std_dev = variance ** 0.5
        
        if std_dev == 0:
            return 0.0, "No variation in values"
        
        anomalies = []
        for i, row in enumerate(self.dataset):
            val = row.get(column)
            if val is not None and isinstance(val, (int, float)):
                z_score = abs((val - mean) / std_dev)
                if z_score > threshold:
                    anomalies.append(i)
        
        if anomalies:
            self.anomalies_detected.add(column)
            for idx in anomalies:
                self.dataset[idx][column] = mean  # Replace with mean
            return 0.25, f"Detected and fixed {len(anomalies)} anomalies in '{column}'"
        
        return 0.1, f"No anomalies detected in '{column}' (threshold: {threshold})"
    
    def _standardize_column(self, column: str, method: str) -> Tuple[float, str]:
        """Standardize column values."""
        if column not in self.dataset[0]:
            return -0.1, f"Column '{column}' not found"
        
        if column in self.standardized_columns:
            return 0.0, f"Column '{column}' already standardized"
        
        changes = 0
        
        if method == 'lowercase':
            for row in self.dataset:
                if isinstance(row.get(column), str):
                    original = row[column]
                    row[column] = row[column].lower()
                    if original != row[column]:
                        changes += 1
        
        elif method == 'uppercase':
            for row in self.dataset:
                if isinstance(row.get(column), str):
                    original = row[column]
                    row[column] = row[column].upper()
                    if original != row[column]:
                        changes += 1
        
        elif method == 'title_case':
            for row in self.dataset:
                if isinstance(row.get(column), str):
                    original = row[column]
                    row[column] = row[column].title()
                    if original != row[column]:
                        changes += 1
        
        elif method == 'minmax':
            values = [row[column] for row in self.dataset if row[column] is not None 
                     and isinstance(row[column], (int, float))]
            if values:
                min_val = min(values)
                max_val = max(values)
                range_val = max_val - min_val
                if range_val > 0:
                    for row in self.dataset:
                        if isinstance(row.get(column), (int, float)):
                            row[column] = (row[column] - min_val) / range_val
                            changes += 1
        
        if changes > 0:
            self.standardized_columns.add(column)
            return 0.2, f"Standardized {changes} values in '{column}' using {method}"
        
        return 0.0, f"No changes needed for '{column}' standardization"
    
    def _validate_data(self, column: str) -> Tuple[float, str]:
        """Validate data integrity."""
        if column not in self.dataset[0]:
            return -0.1, f"Column '{column}' not found"
        
        validation_passed = True
        issues = []
        
        # Check for remaining nulls
        nulls = sum(1 for row in self.dataset if row.get(column) is None)
        if nulls > 0:
            validation_passed = False
            issues.append(f"{nulls} null values")
        
        # Check for invalid ranges
        if column in ['age', 'satisfaction', 'nps_score', 'rating']:
            for row in self.dataset:
                val = row.get(column)
                if val is not None:
                    if column == 'age' and not (18 <= val <= 120):
                        validation_passed = False
                        issues.append(f"Invalid age: {val}")
                    elif column == 'satisfaction' and not (1 <= val <= 5):
                        validation_passed = False
                        issues.append(f"Invalid satisfaction: {val}")
        
        if validation_passed:
            return 0.3, f"'{column}' validation passed (no issues found)"
        else:
            return -0.15, f"'{column}' validation failed: {', '.join(issues[:3])}"
    
    def _aggregate_data(self, column: str) -> Tuple[float, str]:
        """Aggregate or summarize data."""
        if column not in self.dataset[0]:
            return -0.1, f"Column '{column}' not found"
        
        values = [row[column] for row in self.dataset if row[column] is not None 
                 and isinstance(row[column], (int, float))]
        
        if not values:
            return 0.0, f"No numeric values in '{column}' to aggregate"
        
        summary = {
            'count': len(values),
            'sum': sum(values),
            'mean': sum(values) / len(values),
            'min': min(values),
            'max': max(values),
        }
        
        return 0.15, f"Aggregated '{column}': count={summary['count']}, mean={summary['mean']:.2f}"
    
    def _calculate_quality_score(self) -> float:
        """Calculate overall data quality score."""
        if not self.dataset:
            return 0.0
        
        score = 1.0
        
        # Penalty for missing values
        total_values = len(self.dataset) * len(self.dataset[0])
        missing_count = sum(1 for row in self.dataset for val in row.values() if val is None)
        score -= (missing_count / total_values) * 0.3
        
        # Reward for handled columns
        score += (len(self.handled_columns) / len(self.dataset[0])) * 0.3
        
        # Reward for standardized columns
        score += (len(self.standardized_columns) / len(self.dataset[0])) * 0.2
        
        return max(0.0, min(1.0, score))
    
    def _get_observation(self) -> Observation:
        """Generate observation from current state."""
        missing_cols = []
        for col in self.dataset[0].keys() if self.dataset else []:
            if any(row.get(col) is None for row in self.dataset):
                missing_cols.append(col)
        
        return Observation(
            current_row_index=self.current_row_index,
            total_rows=len(self.dataset),
            missing_columns=missing_cols,
            anomaly_columns=list(self.anomalies_detected),
            standardized_columns=list(self.standardized_columns),
            data_quality_score=self._calculate_quality_score(),
            last_action_result="Episode started",
            completion_percentage=min(100.0, (len(self.handled_columns) / max(1, len(self.dataset[0]))) * 100)
        )
