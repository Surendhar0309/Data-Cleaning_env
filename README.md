---
title: Data Cleaning OpenEnv
emoji: 🧹
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
tags:
  - openenv
---

# Data Cleaning & Analytics Environment

> An OpenEnv-compliant reinforcement learning environment where agents learn to clean messy, real-world datasets — handling missing values, detecting anomalies, standardizing formats, and preparing data for analysis.

---

## Overview

This environment simulates authentic data cleaning workflows that data professionals encounter daily. Rather than toy or game-like problems, agents interact with real-world quality issues:

- **Missing values** across multiple columns
- **Invalid data** — negative ages, impossible scores, out-of-range entries
- **Inconsistent formats** — mixed case, different country codes, varied date styles
- **Anomalies and outliers** — extreme values, statistical deviations
- **Custom datasets** — upload your own CSV and clean it interactively

The goal is to maximize data quality while operating efficiently. Good agents clean datasets with minimal unnecessary operations.

---

## What's New in v2.0

| Feature | Description |
|---|---|
| **CSV Upload** | Upload any CSV file and clean it interactively via the UI |
| **Download Cleaned Data** | Export the post-cleaning dataset as a CSV at any point |
| **Configurable Server URL** | Set a custom backend URL in the UI — no code changes needed |
| **Persistent Server Config** | Server URL is saved to `localStorage` across page refreshes |
| **Improved CORS** | Wildcard CORS on all endpoints for seamless GitHub Pages support |

---

## Key Features

- **Real-world problem** — three authentic data cleaning tasks across sales, customer, and survey data
- **Custom CSV support** — upload and clean your own datasets with the same action API
- **OpenEnv compliant** — full spec with typed Pydantic models and standard REST API
- **Graded tasks** — 3 difficulty levels (easy → medium → hard) with automated quality graders
- **Meaningful rewards** — partial progress signals, not just binary success/failure
- **Reproducible baseline** — heuristic baseline agent achieving >70% success across all tasks
- **Production-ready** — Docker deployment, FastAPI server, GitHub Pages frontend

---

## Tasks at a Glance

| Task | Dataset | Issues | Difficulty | Target Quality |
|---|---|---|---|---|
| `easy_sales_cleaning` | Sales transactions (30 rows) | Missing amounts/quantities, inconsistent status field | Easy | 0.85 |
| `medium_customer_cleaning` | Customer data (40 rows) | Invalid ages, format inconsistencies, missing emails/LTV | Medium | 0.80 |
| `hard_survey_analytics` | Survey responses (50 rows) | Anomalies in scores, invalid ranges, mixed device types | Hard | 0.75 |
| `custom_upload` | Your CSV file | Whatever issues exist in your data | Custom | 0.80 |

---

## Project Structure

```
data-cleaning-env/
├── environment.py        # Core RL environment (DataCleaningEnv, Pydantic models)
├── server.py             # FastAPI server — reset, step, state, grader, upload, download
├── inference.py          # Baseline heuristic agent
├── validate.py           # OpenEnv spec compliance tests
├── index.html            # Frontend UI (GitHub Pages compatible)
├── app.js                # Frontend logic — episode control, upload, download
├── style.css             # Custom styles (used alongside Tailwind CDN)
├── openenv.yaml          # OpenEnv specification
├── Dockerfile            # Container configuration
├── requirements.txt      # Python dependencies
└── README.md             # This file
```

---

## Installation

### Prerequisites

- Python 3.10+
- pip or uv
- Docker (for containerised deployment)

### Setup

```bash
# Clone the repository
git clone https://github.com/Surendhar0309/Data-Cleaning_env.git
cd Data-Cleaning_env

# Install dependencies
pip install -r requirements.txt

# Or with uv (faster)
uv pip install -r requirements.txt
```

### Dependencies

```
fastapi==0.104.1
uvicorn==0.24.0
pydantic==2.5.0
numpy==1.26.2
requests==2.31.0
python-multipart==0.0.6
```

---

## Running Locally

### 1. Start the Server

```bash
python server.py
```

Server starts at `http://localhost:7860`. API docs available at `http://localhost:7860/docs`.

### 2. Open the Frontend

Open `index.html` directly in your browser, or serve it with any static file server:

```bash
# Python built-in server
python -m http.server 8080
# Then open http://localhost:8080
```

### 3. Connect the UI to Your Server

In the header of the UI, enter your server URL (e.g. `http://localhost:7860`) and click **Connect**. The URL is saved automatically for future visits.

### 4. Run the Baseline Agent

```bash
python inference.py
```

This runs the heuristic agent across all 3 tasks, prints step-by-step cleaning actions, and saves results to `baseline_results.json`.

---

## GitHub Pages Deployment

The frontend (`index.html`, `app.js`, `style.css`) is fully compatible with GitHub Pages — it connects to a separately hosted backend.

### Steps

1. Push your code to GitHub
2. Enable GitHub Pages on the `main` branch from the repo settings
3. Your UI will be live at `https://surendhar0309.github.io/Data-Cleaning_env/`
4. Run `python server.py` locally or deploy the backend (see Docker below)
5. In the UI header, set the Server URL to your backend address and click **Connect**

> **CORS is configured with `allow_origins=["*"]`** in `server.py`, so any origin (including GitHub Pages) can call the API without being blocked by the browser.

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

Access at `http://localhost:7860`.

### Deploy to Hugging Face Spaces

```bash
# Add HF remote
git remote add hf https://huggingface.co/spaces/your-username/data-cleaning-env

# Push
git push hf main
```

Hugging Face will auto-detect the Dockerfile, build the image, and serve it on port 7860.

---

## API Reference

All endpoints return JSON. Request bodies use `Content-Type: application/json` unless noted.

### `GET /`
Health check. Returns server status and list of available tasks.

---

### `POST /reset`
Reset the environment for a task and return the initial observation.

**Request**
```json
{ "task_name": "easy_sales_cleaning" }
```

**Response**
```json
{
  "status": "success",
  "episode_id": "easy_sales_cleaning",
  "observation": {
    "current_row_index": 0,
    "total_rows": 30,
    "missing_columns": ["amount", "quantity", "category"],
    "anomaly_columns": [],
    "standardized_columns": [],
    "data_quality_score": 0.65,
    "last_action_result": "Episode started",
    "completion_percentage": 0.0
  }
}
```

---

### `POST /step`
Execute one cleaning action.

**Request**
```json
{
  "task_name": "easy_sales_cleaning",
  "action": {
    "action_type": "handle_missing",
    "column_name": "amount",
    "method": "mean"
  }
}
```

**Response**
```json
{
  "status": "success",
  "observation": { "...": "..." },
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

---

### `POST /state` · `GET /state`
Returns the complete environment state — dataset, metadata, and action history.

---

### `POST /grader` · `GET /grader`
Grades the current episode.

**Response**
```json
{
  "status": "success",
  "score": 0.88,
  "details": {
    "quality_score": 0.91,
    "target_quality": 0.85,
    "num_actions": 12,
    "efficiency": 0.88,
    "passed": true
  }
}
```

---

### `GET /tasks`
Lists all available tasks with their action schemas.

---

### `POST /upload`
Upload a custom CSV file. Returns columns, row count, and an initial observation.

**Request** — `multipart/form-data`

| Field | Type | Description |
|---|---|---|
| `file` | File | A `.csv` file |

**Response**
```json
{
  "status": "success",
  "task_name": "custom_upload",
  "rows": 120,
  "columns": ["id", "age", "salary", "country"],
  "observation": { "...": "..." }
}
```

After a successful upload, use `task_name: "custom_upload"` in subsequent `/step`, `/grader`, and `/download` calls.

---

### `GET /download/{task_name}`
Download the current (cleaned) dataset as a CSV file.

```
GET /download/easy_sales_cleaning
GET /download/custom_upload
```

Returns a `text/csv` response with `Content-Disposition: attachment`.

---

### `POST /baseline` · `GET /baseline`
Runs the heuristic baseline agent on one or all tasks and returns quality scores.

---

## Action Schema

```python
class CleaningAction(BaseModel):
    action_type: str          # Required — see types below
    column_name: str          # Required — target column
    method: Optional[str]     # For handle_missing and standardize
    value: Optional[float]    # For manual imputation
    threshold: Optional[float]  # For detect_anomaly
```

### Action Types

**`handle_missing`** — fill or remove NULL values

```json
{ "action_type": "handle_missing", "column_name": "amount", "method": "mean" }
```

| Method | Behaviour |
|---|---|
| `mean` | Replace NULLs with column mean |
| `median` | Replace NULLs with column median |
| `delete` | Drop rows where this column is NULL |
| `forward_fill` | Use the previous row's value |

---

**`detect_anomaly`** — find and fix statistical outliers via z-score

```json
{ "action_type": "detect_anomaly", "column_name": "age", "threshold": 2.5 }
```

Replaces values beyond `threshold` standard deviations with the column mean.

---

**`standardize`** — normalize text or numeric column format

```json
{ "action_type": "standardize", "column_name": "status", "method": "lowercase" }
```

| Method | Behaviour |
|---|---|
| `lowercase` | Convert strings to lowercase |
| `uppercase` | Convert strings to uppercase |
| `title_case` | Title Case formatting |
| `minmax` | Normalize numeric column to [0, 1] |
| `zscore` | Standardize to zero mean, unit variance |

---

**`validate`** — check column for integrity issues (NULLs, invalid ranges)

```json
{ "action_type": "validate", "column_name": "age" }
```

---

**`aggregate`** — summarize column statistics without modifying data

```json
{ "action_type": "aggregate", "column_name": "amount" }
```

---

## Reward Structure

| Action | Base Reward | Condition |
|---|---|---|
| `handle_missing` | +0.25 – +0.30 | Proportional to impact |
| `detect_anomaly` | +0.25 | If anomalies were found |
| `standardize` | +0.20 | If changes were applied |
| `validate` | +0.30 | If validation passes |
| `aggregate` | +0.15 | Always |
| Every step | −0.01 | Step penalty for efficiency |
| Task completion | +1.00 | Quality ≥ target threshold |

### Grading Formula

```
quality_score  = 1.0
               - (missing_values / total_values) × 0.3
               + (columns_handled / total_columns) × 0.3
               + (columns_standardized / total_columns) × 0.2

efficiency     = 1.0 - (actions_taken / max_actions)

grading_score  = (quality_score × 0.6) + (efficiency × 0.4)
               + 0.10 bonus if quality ≥ target
```

---

## Baseline Performance

The included heuristic agent (`inference.py`) achieves:

| Task | Quality Score | Steps | Reward | Result |
|---|---|---|---|---|
| `easy_sales_cleaning` | 0.88 | 18 | 4.2 | ✅ Pass |
| `medium_customer_cleaning` | 0.84 | 24 | 3.8 | ✅ Pass |
| `hard_survey_analytics` | 0.81 | 28 | 3.4 | ✅ Pass |

**Overall: 3/3 tasks pass (100%)**

### Strategy

1. Handle missing values with mean imputation for numeric columns, delete for others
2. Detect and replace outliers using z-score threshold of 2.5
3. Standardize text columns (lowercase for categories, title case for names)
4. Validate columns for data integrity
5. Aggregate numeric column statistics

---

## Development Guide

### Adding a New Task

1. Add a dataset generator method to `DatasetGenerator` in `environment.py`:

```python
def generate_my_dataset(self, num_rows: int = 50) -> List[Dict[str, Any]]:
    # Return list of row dicts with intentional quality issues
    pass
```

2. Add a case in `DataCleaningEnv.reset()` for the new difficulty/task.

3. Register the environment in `server.py`:

```python
environments["my_new_task"] = DataCleaningEnv(task_difficulty="medium")
```

4. Add the task definition to `openenv.yaml`.

### Extending Actions

1. Add a handler method to `DataCleaningEnv` (e.g. `_handle_duplicates()`)
2. Add the case in `step()` dispatching logic
3. Update the `action_type` enum in `openenv.yaml`

### Custom Grading

Override `_calculate_quality_score()` in `environment.py` or modify the grader endpoint logic in `server.py`.

---

## Troubleshooting

**"Could not connect to server"**
- Make sure `python server.py` is running
- Check the Server URL in the UI header — update it to match your server address
- Verify no firewall is blocking port 7860

**Port 7860 already in use**
```bash
# Kill the process using port 7860
lsof -ti:7860 | xargs kill -9

# Or start on a different port
PORT=8000 python server.py
```

**Import errors**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

**CSV upload fails**
- Ensure the file is UTF-8 encoded
- Make sure the file has a header row
- Only `.csv` format is supported (not `.xlsx`)

**CORS errors in browser**
- Confirm `server.py` is running with the CORS middleware (`allow_origins=["*"]`)
- Check that the Server URL in the UI does not have a trailing slash

---

## Validation

Run the spec compliance test suite:

```bash
python validate.py
```

This tests all 10 OpenEnv compliance checks including Pydantic model correctness, `reset()`/`step()`/`state()` return types, reward bounds, quality scoring, and episode termination.

---

## Citation

```bibtex
@software{datacleaning_env_2024,
  title   = {Data Cleaning \& Analytics OpenEnv Environment},
  author  = {Surendhar, V},
  year    = {2024},
  url     = {https://github.com/Surendhar0309/Data-Cleaning_env}
}
```

---

## License

MIT License. See `LICENSE` for details.

---

## Contributing

Contributions are welcome. Please:

1. Test locally before submitting a pull request
2. Follow PEP 8 style for Python code
3. Document new features and endpoints
4. Ensure backward compatibility with the OpenEnv spec

---

## Support

- **GitHub Issues**: [github.com/Surendhar0309/Data-Cleaning_env/issues](https://github.com/Surendhar0309/Data-Cleaning_env/issues)
- **Email**: ksurendhar95@gmail.com
- **OpenEnv Community**: [github.com/openenv-foundation](https://github.com/openenv-foundation)

---

**Version**: 2.0.0 · **Status**: Production Ready · **Submission**: OpenEnv Hackathon R1
