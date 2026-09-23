# Comprehensive GPU Style + Theme Testing

This system generates images with **both models** (Playground + Animagine), **all 56 styles**, and **all 411 themes**, validated with LLaVA.

## Quick Start

```bash
# Navigate to HSR directory
cd /home/localai/Desktop/HSR

# Run database migrations (creates gpu_test_results and gpu_test_progress tables)
npm run db:migrate --prefix backend

# List all available test sections
node backend/scripts/comprehensive-gpu-test.js --list

# Run a specific section
node backend/scripts/comprehensive-gpu-test.js --section A1

# Resume an interrupted section
node backend/scripts/comprehensive-gpu-test.js --section A1 --resume

# Preview without generating (dry run)
node backend/scripts/comprehensive-gpu-test.js --section A1 --dry-run

# Check status of all sections
node backend/scripts/comprehensive-gpu-test.js --status
```

## Prerequisites

Before running tests, ensure:

1. **ComfyUI servers are running** on ports 8188, 8189, 8190 (3x RTX 3060)
2. **Ollama is running** with llava:7b model installed
3. **PostgreSQL database** is accessible
4. **Output directory** exists: `/home/localai/Desktop/ThemeTests/comprehensive/`

### Check Services

```bash
# Check ComfyUI servers
curl http://127.0.0.1:8188/system_stats
curl http://127.0.0.1:8189/system_stats
curl http://127.0.0.1:8190/system_stats

# Check Ollama with LLaVA
curl http://127.0.0.1:11434/api/tags | jq '.models[] | select(.name | contains("llava"))'

# If LLaVA not installed:
ollama pull llava:7b
```

## Test Sections

### Phase A: Theme Coverage (8 sections, ~34 hours total)

Tests all 411 themes with both models using 3 default styles (default, watercolor, digital_painting).

| Section | Category | Themes | Images | Time |
|---------|----------|--------|--------|------|
| A1 | Anime | 61 | 366 | ~5h |
| A2 | Business | 50 | 300 | ~4h |
| A3 | Exotic | 50 | 300 | ~4h |
| A4 | Fantasy | 50 | 300 | ~4h |
| A5 | Fractal | 50 | 300 | ~4h |
| A6 | Jobs | 50 | 300 | ~4h |
| A7 | Nature | 50 | 300 | ~4h |
| A8 | Space | 50 | 300 | ~4h |

### Phase B: Style Coverage (12 sections, ~60 hours total)

Tests all 56 styles with representative themes from each category.

| Section | Style Category | Model | Images | Time |
|---------|---------------|-------|--------|------|
| B1 | Artistic | Playground | 720 | ~5h |
| B2 | Digital | Playground | 714 | ~5h |
| B3 | Film | Playground | 720 | ~5h |
| B4 | Movements | Playground | 720 | ~5h |
| B5 | Rendering | Playground | 720 | ~5h |
| B6 | Mood | Playground | 720 | ~5h |
| B7 | Artistic | Animagine | 720 | ~5h |
| B8 | Digital | Animagine | 714 | ~5h |
| B9 | Film | Animagine | 720 | ~5h |
| B10 | Movements | Animagine | 720 | ~5h |
| B11 | Rendering | Animagine | 720 | ~5h |
| B12 | Mood | Animagine | 720 | ~5h |

## Recommended Test Schedule

Run 1-2 sections per day to avoid GPU fatigue:

### Week 1: Theme Coverage
```bash
# Monday
node backend/scripts/comprehensive-gpu-test.js --section A1

# Tuesday
node backend/scripts/comprehensive-gpu-test.js --section A2
node backend/scripts/comprehensive-gpu-test.js --section A3

# Wednesday
node backend/scripts/comprehensive-gpu-test.js --section A4
node backend/scripts/comprehensive-gpu-test.js --section A5

# Thursday
node backend/scripts/comprehensive-gpu-test.js --section A6
node backend/scripts/comprehensive-gpu-test.js --section A7

# Friday
node backend/scripts/comprehensive-gpu-test.js --section A8
```

### Week 2: Style Coverage (Playground)
```bash
# Monday-Saturday: B1 through B6
node backend/scripts/comprehensive-gpu-test.js --section B1
# ... etc
```

### Week 3: Style Coverage (Animagine)
```bash
# Monday-Saturday: B7 through B12
node backend/scripts/comprehensive-gpu-test.js --section B7
# ... etc
```

## Running Overnight

For longer sessions, use nohup or screen:

```bash
# Using nohup
nohup node backend/scripts/comprehensive-gpu-test.js --section A1 > test_A1.log 2>&1 &

# Using screen
screen -S gpu-test
node backend/scripts/comprehensive-gpu-test.js --section A1
# Detach with Ctrl+A, D
# Reattach with: screen -r gpu-test
```

## Viewing Results

### Admin Dashboard

Access the GPU test dashboard in the admin panel:

```
http://localhost:3000/admin/gpu-tests
```

Features:
- Section grid showing status (pending/running/completed/failed)
- Progress bars for active tests
- Score distribution charts
- Failed images gallery with LLaVA reasoning
- Filter by model/style/theme category
- Export results to CSV

### HTML Reports

After each section completes, an HTML report is generated:

```
/home/localai/Desktop/ThemeTests/comprehensive/A1/report_A1.html
```

Open in browser to view:
- Pass/fail statistics
- Score distributions
- Image gallery with scores
- Failed generation details

### Database Queries

```sql
-- Overall stats
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE success) as success,
  AVG(llava_style_score) as avg_style,
  AVG(llava_theme_score) as avg_theme,
  AVG(llava_quality_score) as avg_quality
FROM gpu_test_results;

-- Stats by section
SELECT section_id, status, completed_batches, total_batches, pass_rate
FROM gpu_test_progress
ORDER BY section_id;

-- Failed images
SELECT theme_id, style_id, model, error, llava_reasoning
FROM gpu_test_results
WHERE success = false OR llava_style_score < 5
LIMIT 20;

-- Best performing themes
SELECT theme_id, theme_category,
  AVG(llava_theme_score) as avg_score,
  COUNT(*) as samples
FROM gpu_test_results
WHERE success = true
GROUP BY theme_id, theme_category
ORDER BY avg_score DESC
LIMIT 20;
```

## Troubleshooting

### Test Hangs or Fails Mid-Batch

1. Check GPU status: `nvidia-smi`
2. Check ComfyUI logs for errors
3. Resume from last batch: `--resume` flag

### LLaVA Analysis Failing

1. Check Ollama is running: `curl http://127.0.0.1:11434/api/tags`
2. Check LLaVA model: `ollama list | grep llava`
3. Test LLaVA directly: `ollama run llava:7b "describe this image"`

### Database Connection Issues

1. Check PostgreSQL: `sudo systemctl status postgresql`
2. Check connection string in `.env`
3. Run migrations: `npm run db:migrate --prefix backend`

### Low Scores

If scores are consistently low:
1. Check if styles are being applied correctly
2. Verify theme modifiers are appropriate
3. Review LLaVA prompts in imageAnalysis.js
4. Consider adjusting quality thresholds in test-sections.json

## Configuration

### test-sections.json

Modify `/backend/scripts/test-sections.json` to:
- Adjust timing calculations
- Change quality thresholds
- Add custom sections
- Modify theme/style sampling

### imageAnalysis.js

Environment variables:
- `OLLAMA_URL` - Ollama endpoint (default: http://127.0.0.1:11434)
- `LLAVA_MODEL` - Model name (default: llava:7b)
- `LLAVA_MAX_CONCURRENT` - Max concurrent analyses (default: 2)
- `LLAVA_TIMEOUT` - Timeout in ms (default: 60000)
- `LLAVA_ENABLED` - Enable/disable analysis (default: true)

## Output Files

```
/home/localai/Desktop/ThemeTests/comprehensive/
├── A1/
│   ├── A1_b1_0_cyber_warrior_watercolor.png
│   ├── A1_b1_1_cyber_warrior_digital_painting.png
│   ├── ...
│   └── report_A1.html
├── A2/
│   └── ...
└── ...
```

## Quality Thresholds

Default thresholds (configurable in test-sections.json):
- **Pass Score**: 5 (aggregate score >= 5 to pass)
- **Style Minimum**: 6 (style adherence score)
- **Theme Minimum**: 6 (theme accuracy score)
- **Quality Minimum**: 5 (technical quality score)

Images below these thresholds are flagged for review.
