/**
 * Resource Manager - Manages concurrent task execution based on resource limits
 */

import { ConcurrencyConfig, ConcurrencyRule, ResourceType, getRuleForTaskType } from './types.js';

export class ResourceManager {
  private config: ConcurrencyConfig;
  private availableSlots: Map<ResourceType, number>;
  private runningByType: Map<string, Set<string>>; // taskType -> Set of taskIds
  private totalRunning = 0;

  constructor(config: ConcurrencyConfig) {
    this.config = config;
    this.availableSlots = new Map();
    this.runningByType = new Map();
    
    // Initialize slots from global limits
    for (const [resource, limit] of Object.entries(config.globalLimits)) {
      this.availableSlots.set(resource as ResourceType, limit);
    }
    
    // Initialize running sets for each task type
    for (const rule of config.rules) {
      this.runningByType.set(rule.taskType, new Set());
    }
  }

  /**
   * Check if a task can be started
   */
  canAcquire(taskType: string): boolean {
    const rule = getRuleForTaskType(this.config, taskType);
    if (!rule) {
      // No rule = unlimited
      return true;
    }

    // Check per-type limit
    const runningForType = this.runningByType.get(rule.taskType)?.size ?? 0;
    if (runningForType >= rule.maxConcurrent) {
      return false;
    }

    // Check global resource limit
    const available = this.availableSlots.get(rule.resourceType) ?? 0;
    if (available <= 0) {
      return false;
    }

    return true;
  }

  /**
   * Acquire resources for a task. Returns true if successful.
   */
  acquire(taskType: string, taskId: string): boolean {
    if (!this.canAcquire(taskType)) {
      return false;
    }

    const rule = getRuleForTaskType(this.config, taskType);
    if (!rule) {
      return true; // No rule = no tracking needed
    }

    // Decrement resource slot
    const currentSlots = this.availableSlots.get(rule.resourceType) ?? 0;
    this.availableSlots.set(rule.resourceType, currentSlots - 1);

    // Track running task
    const typeSet = this.runningByType.get(rule.taskType);
    if (typeSet) {
      typeSet.add(taskId);
    } else {
      this.runningByType.set(rule.taskType, new Set([taskId]));
    }

    this.totalRunning++;
    return true;
  }

  /**
   * Release resources when a task completes
   */
  release(taskType: string, taskId: string): void {
    const rule = getRuleForTaskType(this.config, taskType);
    if (!rule) {
      return; // No rule = no tracking needed
    }

    // Increment resource slot
    const currentSlots = this.availableSlots.get(rule.resourceType) ?? 0;
    this.availableSlots.set(rule.resourceType, currentSlots + 1);

    // Remove from running set
    const typeSet = this.runningByType.get(rule.taskType);
    if (typeSet) {
      typeSet.delete(taskId);
    }

    this.totalRunning = Math.max(0, this.totalRunning - 1);
  }

  /**
   * Get current status for monitoring
   */
  getStatus(): {
    totalRunning: number;
    byResource: Record<ResourceType, { available: number; total: number }>;
    byType: Record<string, number>;
  } {
    const byResource: Record<ResourceType, { available: number; total: number }> = {} as any;
    for (const [resource, available] of this.availableSlots) {
      const total = this.config.globalLimits[resource] ?? 0;
      byResource[resource] = { available, total };
    }

    const byType: Record<string, number> = {};
    for (const [type, set] of this.runningByType) {
      byType[type] = set.size;
    }

    return {
      totalRunning: this.totalRunning,
      byResource,
      byType,
    };
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: ConcurrencyConfig): void {
    // Calculate deltas and adjust slots
    for (const [resource, newLimit] of Object.entries(newConfig.globalLimits)) {
      const oldLimit = this.config.globalLimits[resource as ResourceType] ?? 0;
      const currentAvailable = this.availableSlots.get(resource as ResourceType) ?? 0;
      const used = oldLimit - currentAvailable;
      const newAvailable = newLimit - used;
      this.availableSlots.set(resource as ResourceType, Math.max(0, newAvailable));
    }

    this.config = newConfig;

    // Ensure all new task types have running sets
    for (const rule of newConfig.rules) {
      if (!this.runningByType.has(rule.taskType)) {
        this.runningByType.set(rule.taskType, new Set());
      }
    }
  }

  /**
   * Get current config
   */
  getConfig(): ConcurrencyConfig {
    return this.config;
  }
}

// Singleton instance
let resourceManagerInstance: ResourceManager | null = null;

export function getResourceManager(): ResourceManager {
  if (!resourceManagerInstance) {
    throw new Error('ResourceManager not initialized. Call initResourceManager first.');
  }
  return resourceManagerInstance;
}

export function initResourceManager(config: ConcurrencyConfig): ResourceManager {
  resourceManagerInstance = new ResourceManager(config);
  return resourceManagerInstance;
}
