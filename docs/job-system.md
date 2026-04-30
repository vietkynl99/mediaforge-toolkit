# Job System - DAG-based Concurrent Task Scheduling

## Overview

Hê thô´ng job runner mô´i cho phép chay song song các task theo dependency graph (DAG) vói quan ly´ resource.

## Architecture

```
                    +-------------------+
                    |   Config Manager  |
                    | (concurrency.json)|
                    +--------+----------+
                             |
                             v
+----------------+    +------+-------+    +----------------+
|  Graph Builder |--->|    Scheduler   |<---| Resource Manager|
| (pipeline->DAG) |    |  (orchestrator)|    |  (slot tracker) |
+----------------+    +------+-------+    +----------------+
                             |
                             v
                    +--------+----------+
                    |  Executor Registry |
                    | (download/uvr/tts/ |
                    |      render)       |
                    +-------------------+
```

## Core Components

### 1. Types (`server/job/types.ts`)

```typescript
// Task types - chi´nh xác 4 loai
type TaskType = 'download' | 'uvr' | 'tts' | 'render';

// Resource types - 3 loai
type ResourceType = 'cpu' | 'gpu' | 'network';

// Task node trong DAG
interface TaskNode {
  id: string;
  type: TaskType;
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
  dependencies: string[];  // IDs of tasks must complete first
  dependents: string[];    // IDs of tasks waiting for this
  priority: number;        // Higher = run first when contested
  params: Record<string, any>;
}

// Concurrency rule per task type
interface ConcurrencyRule {
  taskType: string;
  maxConcurrent: number;      // Max tasks of this type running
  resourceType: ResourceType; // Which resource pool consumed
  priority: number;           // Scheduling priority
}

// Global config
interface ConcurrencyConfig {
  rules: ConcurrencyRule[];
  globalLimits: Record<ResourceType, number>;
}
```

### 2. Resource Manager (`server/job/resource-manager.ts`)

- Track available slots per resource type
- `acquire(taskType, taskId)` - claim resource slot
- `release(taskType, taskId)` - return resource slot
- `canAcquire(taskType)` - check availability
- Runtime update via `updateConfig()`

### 3. Scheduler (`server/job/scheduler.ts`)

**Execution flow:**
1. Initialize ready queue with root tasks (no dependencies)
2. Loop while pending work exists:
   - Schedule ready tasks that can acquire resources
   - Wait for any running task to complete
   - On task complete: mark dependents as ready if all deps met
   - On task fail: cascade failure to all dependents
3. Job completes when all tasks done or cancelled

**Priority scheduling:**
- Ready queue sorted by priority (higher first)
- Higher priority tasks scheduled when resources limited

### 4. Graph Builder (`server/job/graph-builder.ts`)

Converts pipeline definition to JobGraph:
- Create TaskNode for each pipeline node
- Build dependency edges
- Find root/leaf tasks

### 5. Executor (`server/job/executor.ts`)

Base class for task execution:
```typescript
abstract class TaskExecutor {
  type: string;
  execute(task: TaskNode, context: ExecutorContext): Promise<TaskResult>;
  validate(task: TaskNode): Promise<{ valid: boolean; error?: string }>;
}
```

## Configuration

### Default Config

```typescript
{
  rules: [
    { taskType: 'download', maxConcurrent: 4, resourceType: 'network', priority: 4 },
    { taskType: 'uvr', maxConcurrent: 1, resourceType: 'cpu', priority: 3 },
    { taskType: 'tts', maxConcurrent: 2, resourceType: 'network', priority: 2 },
    { taskType: 'render', maxConcurrent: 1, resourceType: 'cpu', priority: 1 },
  ],
  globalLimits: {
    cpu: 8,
    gpu: 1,
    network: 4,
  },
}
```

### Config Storage

Stored in SQLite database (`server/data/main_db.sqlite`):

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

Config is stored as row with `key = 'concurrency_config'`.

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/settings/concurrency` | GET | Get current config |
| `/api/settings/concurrency` | PUT | Update config |
| `/api/settings/concurrency/reset` | POST | Reset to defaults |
| `/api/settings/concurrency/status` | GET | Get running status |

## UI

Settings page at `/settings` tab:
- Global Resource Limits (CPU, GPU, Network)
- Task Concurrency Rules (max concurrent, priority)

## Key Design Decisions

### 1. Resource Types

**Why only 3?**
- `cpu` - Heavy computation (render, uvr)
- `gpu` - GPU acceleration (uvr if using GPU)
- `network` - Network I/O (download, tts)

Removed `io` and `memory` because:
- Not needed for current use cases
- Can add later if required

### 2. Task Types

**Why only 4?**
- Match existing pipeline tasks exactly
- No synthetic sub-tasks exposed to user
- Internal implementation can split if needed

### 3. Priority System

**Purpose:** Decide task order when resources contested

**Guidelines:**
- Higher priority = run first
- Download should be high (user waiting)
- Render should be low (final step)

### 4. Config Persistence

- **First run**: No row in `settings` table -> use `DEFAULT_CONCURRENCY_CONFIG`
- **Subsequent runs**: Load from database
- **Reset**: Overwrite database row with default values
- **Save**: Automatically persists to database file via `persistDb()` callback

## Lessons Learned

### 1. Keep Types Simple

**Problem:** Initially added `download_subs`, `download_video`, etc. as separate task types.

**Solution:** Keep only user-facing tasks. Internal splitting is implementation detail.

### 2. Match Existing Patterns

**Problem:** Created new resource types (`io`, `memory`) not used.

**Solution:** Only add what's needed. YAGNI principle.

### 3. Config Should Be Runtime Editable

**Decision:** Allow config changes without restart via API + ResourceManager.updateConfig()

### 4. UI Reflects Config Structure

**Approach:** Settings page reads from API, displays exact config structure. No hardcoded assumptions.

## Future Work

### Pending Implementation

1. **Task Executors** - Implement concrete executors:
   - DownloadExecutor
   - UvrExecutor  
   - TtsExecutor
   - RenderExecutor

2. **Integration** - Connect to existing `runJob()`:
   - Build JobGraph from job params
   - Use Scheduler instead of sequential execution
   - Track progress via task callbacks

3. **Persistence** - Store JobGraph in database:
   - Resume interrupted jobs
   - Show task-level progress in UI

### Potential Enhancements

- Task retry logic
- Task timeout
- Resource estimation per task
- Dynamic priority adjustment
- Task cancellation propagation

## File Structure

```
server/job/
  index.ts           # Exports
  types.ts           # Core types
  resource-manager.ts # Resource slot tracking
  scheduler.ts       # DAG execution
  graph-builder.ts   # Pipeline -> JobGraph
  executor.ts        # Base executor class
  config-manager.ts  # Config load/save

src/features/settings/
  SettingsPage.tsx   # UI for concurrency config
```

## Quick Reference

### Change Task Resource Type

Edit `server/job/types.ts`:
```typescript
{ taskType: 'tts', resourceType: 'network', ... }
```

### Change Global Limits

Edit `server/job/types.ts`:
```typescript
globalLimits: { cpu: 8, gpu: 1, network: 4 }
```

### Change Task Priority

Edit `server/job/types.ts`:
```typescript
{ taskType: 'download', priority: 4, ... }
```

Higher number = higher priority.

### Reset Config at Runtime

```bash
curl -X POST http://localhost:3001/api/settings/concurrency/reset
```

### View Config in Database

```bash
sqlite3 server/data/main_db.sqlite "SELECT value_json FROM settings WHERE key = 'concurrency_config'"
```

### Check Running Status

```bash
curl http://localhost:3001/api/settings/concurrency/status
```
curl -X POST http://localhost:3001/api/settings/concurrency/reset
```

### Check Running Status

```bash
curl http://localhost:3001/api/settings/concurrency/status
```
