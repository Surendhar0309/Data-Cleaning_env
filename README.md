--- 
title: Data Cleaning OpenEnv 
emoji:  🧹
colorFrom: blue 
colorTo: green 
sdk: docker 
pinned: false 
tags: 
- openenv 

# Data Cleaning & Analytics Environment

An OpenEnv-compliant reinforcement learning environment where agents learn to clean messy, real-world datasets, handle missing values, detect anomalies, and prepare data for analysis.

## Overview

This environment simulates authentic data cleaning workflows that data professionals encounter daily. Rather than game-like or toy problems, agents interact with real-world quality issues:

- **Missing values** across multiple columns
- **Invalid data** (negative ages, impossible scores)
- **Inconsistent formats** (mixed case, different country codes)
- **Anomalies and outliers** (extreme values, statistical deviations)
- **Data validation** across multiple data types

The goal is to maximize data quality while operating efficiently—good agents clean datasets with minimal unnecessary operations.

---

## Key Features

✅ **Real-world problem**: Three authentic data cleaning tasks spanning sales, customer, and survey data  
✅ **OpenEnv compliant**: Full spec with typed Pydantic models, standard API  
✅ **Graded tasks**: 3 tasks (easy → medium → hard) with automated quality graders  
✅ **Meaningful rewards**: Partial progress signals, not just binary success/failure  
✅ **Reproducible baseline**: Heuristic baseline agent with >70% success  
✅ **Production-ready**: Docker deployment, FastAPI server, comprehensive documentation

---

## Tasks at a Glance

| Task | Dataset | Issues | Difficulty | Target Quality |
|------|---------|--------|------------|-----------------|
| **easy_sales_cleaning** | Sales transactions (30 rows) | Missing amounts/quantities, inconsistent status field | Easy | 0.85 |
| **medium_customer_cleaning** | Customer data (40 rows) | Invalid ages, format inconsistencies, missing emails | Medium | 0.80 |
| **hard_survey_analytics** | Survey responses (50 rows) | Anomalies in scores, invalid ranges, mixed types | Hard | 0.75 |

---

## Installation

### Prerequisites

- Python 3.10+
- pip or uv
- Docker (for deployment)

### Setup

```bash
# Clone or extract project
cd data-cleaning-env

# Install dependencies
pip install -r requirements.txt

# Or with uv (faster)
uv pip install -r requirements.txt
```

### Dependencies

- `fastapi>=0.104.1` - Web framework
- `uvicorn>=0.24.0` - ASGI server
- `pydantic>=2.5.0` - Data validation
- `numpy>=1.26.2` - Numerical operations
- `requests>=2.31.0` - HTTP client

---

## Running Locally

### 1. Start the Server

```bash
python server.py
```

Server will start at `http://localhost:7860`

### 2. Run Baseline Agent

In another terminal:

```bash
python baseline_inference.py
```

This will:
- Run the heuristic agent on all 3 tasks
- Show step-by-step cleaning actions
- Print quality scores and rewards
- Save results to `baseline_results.json`

### 3. Test with cURL

```bash
# Health check
curl http://localhost:7860/

# Reset environment
curl -X POST http://localhost:7860/reset \
  -H "Content-Type: application/json" \
  -d '{"task_name": "easy_sales_cleaning"}'

# List tasks
curl http://localhost:7860/tasks

# Get baseline scores
curl -X POST http://localhost:7860/baseline \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## API Specification

All endpoints follow OpenEnv standards. Request/response bodies use JSON with typed Pydantic models.

### Health Check

```
GET /
```

Returns service status and available tasks.

### Reset Episode

```
POST /reset
Content-Type: application/json

{
  "task_name": "easy_sales_cleaning"
}
```

**Response:**
```json
{
  "status": "success",
  "observation": {
    "current_row_index": 0,
    "total_rows": 30,
    "missing_columns": ["amount", "quantity", "category"],
    "anomaly_columns": [],
    "standardized_columns": [],
    "data_quality_score": 0.65,
    "last_action_result": "Episode started",
    "completion_percentage": 0.0
  },
  "episode_id": "easy_sales_cleaning"
}
```

### Step Action

```
POST /step
Content-Type: application/json

{
  "task_name": "easy_sales_cleaning",
  "action": {
    "action_type": "handle_missing",
    "column_name": "amount",
    "method": "mean"
  }
}
```

**Response:**
```json
{
  "status": "success",
  "observation": { ... },
  "reward": {
    "immediate_reward": 0.29,
    "cumulative_reward": 0.29,
    "bonus_flags": {}
  },
  "done": false,
  "info": {
    "task_difficulty": "easy",
    "quality_score": 0.72,
    "columns_handled": ["amount"],
    "anomalies_found": []
  },
  "step": 1
}
```

### Get State

```
POST /state
Content-Type: application/json

{
  "task_name": "easy_sales_cleaning"
}
```

Returns complete environment state including dataset, metadata, and action history.

### List Tasks

```
GET /tasks
```

Returns all available tasks with action schemas.

### Get Baseline Scores

```
POST /baseline
Content-Type: application/json

{
  "task_name": "easy_sales_cleaning"
}
```

Runs baseline heuristic agent and returns scores for specified task (or all if omitted).

### Grade Episode

```
POST /grader
Content-Type: application/json

{
  "task_name": "easy_sales_cleaning",
  "episode_data": { ... }
}
```

Returns grading score (0.0–1.0) based on quality metrics and efficiency.

---

## Action Schema

All actions follow this Pydantic model:

```python
class CleaningAction(BaseModel):
    action_type: str  # Required
    column_name: str  # Required
    method: Optional[str]  # depends on action_type
    value: Optional[float]  # for manual imputation
    threshold: Optional[float]  # for anomaly detection
```

### Action Types

#### 1. **handle_missing**
Handle NULL/missing values in a column.

```json
{
  "action_type": "handle_missing",
  "column_name": "amount",
  "method": "mean"  // mean, median, delete, forward_fill
}
```

Methods:
- `mean` - Fill with column mean (numeric columns)
- `median` - Fill with column median (numeric columns)
- `delete` - Remove rows with missing values
- `forward_fill` - Use previous row's value
- Custom value - Pass explicit number via `value` field

#### 2. **detect_anomaly**
Find and fix statistical outliers using z-score method.

```json
{
  "action_type": "detect_anomaly",
  "column_name": "age",
  "threshold": 2.5
}
```

Replaces outliers beyond threshold standard deviations with column mean.

#### 3. **standardize**
Normalize format and encoding of text columns.

```json
{
  "action_type": "standardize",
  "column_name": "status",
  "method": "lowercase"  // lowercase, uppercase, title_case, minmax
}
```

Methods:
- `lowercase` - Convert to lowercase
- `uppercase` - Convert to uppercase
- `title_case` - Title Case Formatting
- `minmax` - Normalize numeric column to [0, 1]

#### 4. **validate**
Check column for data integrity issues.

```json
{
  "action_type": "validate",
  "column_name": "age"
}
```

Checks for:
- NULL values
- Invalid numeric ranges (e.g., age 18–120)
- Type consistency

#### 5. **aggregate**
Summarize column statistics.

```json
{
  "action_type": "aggregate",
  "column_name": "amount"
}
```

Returns count, sum, mean, min, max without modifying data.

---

## Observation Schema

Observations describe the current dataset state:

```python
class Observation(BaseModel):
    current_row_index: int  # Current processing position
    total_rows: int  # Total rows in dataset
    missing_columns: List[str]  # Columns with NULLs
    anomaly_columns: List[str]  # Cols with detected anomalies
    standardized_columns: List[str]  # Already processed cols
    data_quality_score: float  # 0.0–1.0 quality metric
    last_action_result: str  # Result of previous action
    completion_percentage: float  # % of columns handled
```

---

## Reward Schema

```python
class Reward(BaseModel):
    immediate_reward: float  # This step's reward
    cumulative_reward: float  # Total so far
    bonus_flags: Dict[str, bool]  # Achievement flags
```

### Reward Breakdown

| Action | Base Reward | Conditions |
|--------|------------|-----------|
| Handle missing | +0.25–0.30 | Based on impact |
| Detect anomaly | +0.25 | If anomalies found |
| Standardize | +0.20 | If changes applied |
| Validate | +0.30 | If validation passes |
| Aggregate | +0.15 | Always applied |
| All steps | -0.01 | Step penalty (efficiency) |
| Task completion | +1.00 | Quality ≥ target |

### Bonus Flags

- `anomaly_detected` - Successfully found outliers
- `column_standardized` - Format normalization applied
- `validation_passed` - Data integrity verified
- `task_complete` - Quality threshold reached

---

## Task Definitions

### Easy: Sales Cleaning

**Dataset**: 30 synthetic sales transactions

**Issues**:
- 15% missing `amount` values
- 10% missing `quantity` values  
- 10% missing `category` values
- Status field has inconsistent casing (`completed` vs `COMPLETED`)
- 5% amount outliers (5–20× normal range)

**Sample Data**:
```json
{
  "transaction_id": "TXN_00001",
  "customer_id": "CUST_2513",
  "amount": 245.67,
  "quantity": 5,
  "date": "2024-03-15",
  "category": "Electronics",
  "status": "completed"
}
```

**Evaluation**:
- Target quality: 0.85
- Max steps: 100
- Grading: 60% quality + 40% efficiency

---

### Medium: Customer Cleaning

**Dataset**: 40 customer records

**Issues**:
- 12% missing `age` values
- 8% missing `email` values
- 10% missing `ltv` (lifetime value) values
- Name inconsistencies (`john smith`, `JOHN SMITH`, `John Smith`)
- Country code variations (`USA`, `us`, `US`, `Canada`, `CAN`)
- 3% invalid ages (999, −5, 150)

**Sample Data**:
```json
{
  "customer_id": "CUST_4521",
  "name": "jane doe",
  "age": 34,
  "email": "jane@example.com",
  "signup_date": "2023-07-12",
  "ltv": 2450.50,
  "country": "usa"
}
```

**Evaluation**:
- Target quality: 0.80
- Max steps: 100
- Grading: 60% quality + 40% efficiency

---

### Hard: Survey Analytics

**Dataset**: 50 survey responses

**Issues**:
- 10% missing `satisfaction` scores
- 12% missing `nps_score` (Net Promoter Score)
- 15% missing `review_length`
- 10% missing `rating` values
- 8% missing `completion_time_sec`
- Invalid ranges: satisfaction scores (0, 6, −1, 999)
- NPS score range (−100 to +100)
- Device type variations (`mobile`, `MOBILE`, `Mobile`)
- 4% impossible satisfaction values

**Sample Data**:
```json
{
  "response_id": "RESP_00001",
  "satisfaction": 4,
  "nps_score": 75,
  "review_length": 234,
  "rating": 4.5,
  "completion_time_sec": 180,
  "device": "mobile"
}
```

**Evaluation**:
- Target quality: 0.75
- Max steps: 100
- Grading: 60% quality + 40% efficiency

---

## Baseline Performance

The included heuristic agent achieves:

| Task | Quality Score | Steps | Reward | Status |
|------|---------------|-------|--------|--------|
| easy_sales_cleaning | 0.88 | 18 | 4.2 | ✅ Pass |
| medium_customer_cleaning | 0.84 | 24 | 3.8 | ✅ Pass |
| hard_survey_analytics | 0.81 | 28 | 3.4 | ✅ Pass |

**Overall**: 3/3 tasks pass (100%)

### Baseline Strategy

1. Handle missing values with mean imputation
2. Detect and remove outliers (z-score > 2.5)
3. Standardize text columns (lowercase, title case)
4. Validate columns for integrity
5. Aggregate numeric statistics

---

## Quality Scoring Formula

```
quality_score = 1.0
  - (missing_values / total_values) * 0.3
  + (columns_handled / total_columns) * 0.3
  + (columns_standardized / total_columns) * 0.2

grading_score = (quality_score * 0.6) + (efficiency * 0.4)

efficiency = 1.0 - (actions_taken / max_actions)

bonus_if_target_reached = +0.10
```

---

## Docker Deployment

### Build

```bash
docker build -t data-cleaning-env:latest .
```

### Run Locally

```bash
docker run -p 7860:7860 data-cleaning-env:latest
```

Access at `http://localhost:7860`

### Deploy to Hugging Face Spaces

1. Create Hugging Face account and Space
2. Add repository as remote:
```bash
git remote add hf https://huggingface.co/spaces/your-username/data-cleaning-env
```

3. Deploy:
```bash
git push hf main
```

HF will automatically:
- Detect Dockerfile
- Build the image
- Start server on port 7860
- Provide public URL

---

## Project Structure

```
data-cleaning-env/
├── environment.py           # Core environment (DataCleaningEnv)
├── server.py               # FastAPI server with endpoints
├── baseline_inference.py    # Baseline heuristic agent
├── openenv.yaml            # OpenEnv specification
├── Dockerfile              # Container configuration
├── requirements.txt        # Python dependencies
└── README.md              # This file
```

---

## Development Guide

### Adding a New Task

1. Add dataset generator to `DatasetGenerator` class:
```python
def generate_my_dataset(self, num_rows: int = 50) -> List[Dict[str, Any]]:
    # Return list of dictionaries
    pass
```

2. Update `DataCleaningEnv.reset()` to use new dataset

3. Register in `environments` dict in `server.py`

4. Add task definition to `openenv.yaml` tasks section

### Extending Actions

1. Add new method to `DataCleaningEnv` class (e.g., `_handle_duplicates()`)
2. Add case in `step()` method
3. Update `action_type` enum in `openenv.yaml`

### Custom Grading

Override `_calculate_quality_score()` or modify grader endpoint logic in `server.py`.

---

## Troubleshooting

### Port 7860 Already in Use

```bash
# Kill process on port 7860
lsof -ti:7860 | xargs kill -9

# Or use different port
python server.py --port 8000
```

### Import Errors

```bash
# Reinstall dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### API Errors

- Check server is running: `curl http://localhost:7860/`
- Check task name is valid: `curl http://localhost:7860/tasks`
- View logs in terminal running server

---

## Citation

If you use this environment in research, please cite:

```bibtex
@software{datacleaning_env_2024,
  title={Data Cleaning & Analytics OpenEnv Environment},
  author={Surendhar, V},
  year={2024},
  url={https://huggingface.co/spaces/your-username/data-cleaning-env}
}
```

---

## License

MIT License - See LICENSE file for details

---

## Contributing

Contributions welcome! Please:
1. Test locally before submitting
2. Follow PEP 8 style guide
3. Document new features
4. Ensure backward compatibility

---

## Support

For issues, questions, or feature requests:
- Open issue on GitHub
- Email: ksurendhar95@gmail.com
- OpenEnv community: https://github.com/openenv-foundation

---

**Last Updated**: March 2024  
**Status**: Production Ready  
**Maturity**: OpenEnv Hackathon R1 Submission
