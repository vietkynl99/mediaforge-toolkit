/**
 * DAG-based Job Scheduler
 * 
 * Manages task execution based on dependencies and resource constraints.
 */

import { JobGraph, TaskNode, TaskStatus, ConcurrencyConfig, DEFAULT_CONCURRENCY_CONFIG } from './types.js';
import { ResourceManager, getResourceManager, initResourceManager } from './resource-manager.js';
import { executorRegistry, ExecutorContext, checkAborted } from './executor.js';

export interface SchedulerEvents {
  onTaskStart?: (taskId: string, task: TaskNode) => void;
  onTaskProgress?: (taskId: string, progress: number, message?: string) => void;
  onTaskComplete?: (taskId: string, task: TaskNode) => void;
  onTaskFailed?: (taskId: string, task: TaskNode, error: string) => void;
  onJobComplete?: (graph: JobGraph) => void;
  onJobFailed?: (graph: JobGraph, error: string) => void;
  onLog?: (taskId: string, message: string) => void;
}

export class JobScheduler {
  private graph: JobGraph;
  private resourceManager: ResourceManager;
  private events: SchedulerEvents;
  private runningTasks = new Map<string, AbortController>();
  private readyQueue: string[] = [];  // Task IDs ready to run (waiting for resources)
  private isRunning = false;
  private abortController: AbortController | null = null;

  constructor(graph: JobGraph, resourceManager: ResourceManager, events: SchedulerEvents = {}) {
    this.graph = graph;
    this.resourceManager = resourceManager;
    this.events = events;
  }

  /**
   * Start executing the job graph
   */
  async run(): Promise<JobGraph> {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    this.graph.status = 'running';
    this.graph.startedAt = new Date().toISOString();

    try {
      // Initialize ready queue with root tasks
      this.initializeReadyQueue();

      while (this.hasPendingWork()) {
        checkAborted(this.abortController.signal);

        // Try to schedule as many ready tasks as possible
        const scheduled = this.scheduleReadyTasks();

        if (scheduled === 0 && this.runningTasks.size === 0) {
          // No tasks running and none could be scheduled - deadlock or done
          if (this.readyQueue.length > 0) {
            throw new Error('Resource deadlock: tasks waiting but no resources available');
          }
          break;
        }

        if (this.runningTasks.size > 0) {
          // Wait for at least one task to complete
          await this.waitForAnyTask();
        } else {
          // Small delay to prevent CPU spin
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // All tasks completed
      this.graph.status = 'completed';
      this.graph.finishedAt = new Date().toISOString();
      this.graph.progress = 100;
      this.events.onJobComplete?.(this.graph);

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed';
      
      if (message === 'Task cancelled' || this.abortController?.signal.aborted) {
        this.graph.status = 'cancelled';
        this.cancelAllTasks();
      } else {
        this.graph.status = 'failed';
        this.graph.error = message;
      }
      
      this.graph.finishedAt = new Date().toISOString();
      this.events.onJobFailed?.(this.graph, message);
    } finally {
      this.isRunning = false;
    }

    return this.graph;
  }

  /**
   * Cancel the job
   */
  cancel(): void {
    this.abortController?.abort();
  }

  /**
   * Get current graph state
   */
  getGraph(): JobGraph {
    return this.graph;
  }

  /**
   * Initialize the ready queue with tasks that have no dependencies
   */
  private initializeReadyQueue(): void {
    this.readyQueue = [];
    
    for (const [taskId, task] of this.graph.tasks) {
      if (task.dependencies.length === 0) {
        task.status = 'ready';
        this.readyQueue.push(taskId);
      }
    }
    
    this.sortReadyQueue();
  }

  /**
   * Sort ready queue by priority (higher first)
   */
  private sortReadyQueue(): void {
    this.readyQueue.sort((a, b) => {
      const taskA = this.graph.tasks.get(a)!;
      const taskB = this.graph.tasks.get(b)!;
      return taskB.priority - taskA.priority;
    });
  }

  /**
   * Try to schedule ready tasks that can acquire resources
   * Returns number of tasks scheduled
   */
  private scheduleReadyTasks(): number {
    let scheduled = 0;
    const toRemove: number[] = [];

    for (let i = 0; i < this.readyQueue.length; i++) {
      const taskId = this.readyQueue[i];
      const task = this.graph.tasks.get(taskId)!;

      if (this.resourceManager.acquire(task.type, taskId)) {
        toRemove.push(i);
        this.startTask(task);
        scheduled++;
      }
    }

    // Remove scheduled tasks from queue (reverse order to maintain indices)
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.readyQueue.splice(toRemove[i], 1);
    }

    return scheduled;
  }

  /**
   * Start executing a task
   */
  private startTask(task: TaskNode): void {
    task.status = 'running';
    task.progress = 0;
    task.startedAt = new Date().toISOString();

    const abortController = new AbortController();
    this.runningTasks.set(task.id, abortController);

    const context: ExecutorContext = {
      signal: abortController.signal,
      onProgress: (progress, message, processed, total) => {
        task.progress = progress;
        if (processed !== undefined) (task as any).processed = processed;
        if (total !== undefined) (task as any).total = total;
        this.events.onTaskProgress?.(task.id, progress, message);
      },
      onLog: (message) => {
        this.events.onLog?.(task.id, message);
      },
    };

    // Run task asynchronously
    this.executeTask(task, context)
      .then(result => {
        if (result.success) {
          this.onTaskComplete(task, result.outputs);
        } else {
          this.onTaskFailed(task, result.error ?? 'Task failed');
        }
      })
      .catch(error => {
        this.onTaskFailed(task, error.message);
      });
  }

  /**
   * Execute a task using its executor
   */
  private async executeTask(task: TaskNode, context: ExecutorContext): Promise<{ success: boolean; outputs: string[]; error?: string }> {
    const executor = executorRegistry.get(task.type);
    
    if (!executor) {
      return { success: false, outputs: [], error: `No executor registered for task type: ${task.type}` };
    }

    try {
      const result = await executor.execute(task, context);
      return { success: true, outputs: result.outputs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Task execution failed';
      return { success: false, outputs: [], error: message };
    }
  }

  /**
   * Handle task completion
   */
  private onTaskComplete(task: TaskNode, outputs: string[]): void {
    task.status = 'completed';
    task.progress = 100;
    task.outputs = outputs;
    task.finishedAt = new Date().toISOString();

    this.resourceManager.release(task.type, task.id);
    this.runningTasks.delete(task.id);

    this.events.onTaskComplete?.(task.id, task);

    // Check dependents and add to ready queue if all dependencies met
    for (const dependentId of task.dependents) {
      const dependent = this.graph.tasks.get(dependentId);
      if (!dependent || dependent.status !== 'pending') continue;

      const allDepsComplete = dependent.dependencies.every(depId => {
        const dep = this.graph.tasks.get(depId);
        return dep?.status === 'completed';
      });

      if (allDepsComplete) {
        dependent.status = 'ready';
        this.readyQueue.push(dependentId);
      }
    }

    this.sortReadyQueue();
    this.updateJobProgress();
  }

  /**
   * Handle task failure
   */
  private onTaskFailed(task: TaskNode, error: string): void {
    task.status = 'failed';
    task.error = error;
    task.finishedAt = new Date().toISOString();

    this.resourceManager.release(task.type, task.id);
    this.runningTasks.delete(task.id);

    this.events.onTaskFailed?.(task.id, task, error);

    // Mark all dependents as failed (cascade failure)
    this.markDependentsFailed(task.id);

    this.updateJobProgress();
  }

  /**
   * Mark all tasks that depend on a failed task as failed
   */
  private markDependentsFailed(taskId: string): void {
    const task = this.graph.tasks.get(taskId);
    if (!task) return;

    for (const dependentId of task.dependents) {
      const dependent = this.graph.tasks.get(dependentId);
      if (dependent && dependent.status === 'pending') {
        dependent.status = 'failed';
        dependent.error = `Dependency failed: ${taskId}`;
        this.markDependentsFailed(dependentId);
      }
    }
  }

  /**
   * Cancel all running tasks
   */
  private cancelAllTasks(): void {
    for (const [taskId, abortController] of this.runningTasks) {
      abortController.abort();
      const task = this.graph.tasks.get(taskId);
      if (task) {
        task.status = 'cancelled';
        task.error = 'Job cancelled';
      }
    }
    this.runningTasks.clear();
    this.readyQueue = [];
  }

  /**
   * Check if there's any pending work
   */
  private hasPendingWork(): boolean {
    for (const task of this.graph.tasks.values()) {
      if (task.status === 'pending' || task.status === 'ready' || task.status === 'running') {
        return true;
      }
    }
    return false;
  }

  /**
   * Wait for any running task to complete
   */
  private async waitForAnyTask(): Promise<void> {
    if (this.runningTasks.size === 0) return;

    return new Promise(resolve => {
      const check = () => {
        // Check if any task finished or if we can schedule more
        if (this.runningTasks.size === 0) {
          resolve();
          return;
        }

        // Check if any ready task can now be scheduled
        for (const taskId of this.readyQueue) {
          const task = this.graph.tasks.get(taskId);
          if (task && this.resourceManager.canAcquire(task.type)) {
            resolve();
            return;
          }
        }

        // Still waiting
        setTimeout(check, 50);
      };
      check();
    });
  }

  /**
   * Update overall job progress
   */
  private updateJobProgress(): void {
    let totalProgress = 0;
    let totalTasks = 0;

    for (const task of this.graph.tasks.values()) {
      totalProgress += task.progress;
      totalTasks++;
    }

    this.graph.progress = totalTasks > 0 ? Math.round(totalProgress / totalTasks) : 0;
  }
}
