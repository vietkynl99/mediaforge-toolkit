/**
 * System Configuration Manager
 * 
 * Handles loading, saving, and updating system configuration.
 * Uses SQLite database for persistence.
 */

import { SystemConfig, DEFAULT_SYSTEM_CONFIG, ConcurrencyRule, ResourceType } from './types.js';

const SETTINGS_KEY = 'system_config';

export class ConfigManager {
  private db: any; // SQL.Database from sql.js
  private config: SystemConfig;
  private persistCallback: (() => Promise<void>) | null = null;

  constructor(db: any, persistCallback?: () => Promise<void>) {
    this.db = db;
    this.persistCallback = persistCallback ?? null;
    this.config = { ...DEFAULT_SYSTEM_CONFIG };
    
    // Create settings table if not exists
    this.db.run(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    );
  }

  /**
   * Load configuration from database
   */
  async load(): Promise<SystemConfig> {
    try {
      const result = this.db.exec(
        'SELECT value_json FROM settings WHERE key = ? LIMIT 1',
        [SETTINGS_KEY]
      );
      
      if (result[0]?.values?.length) {
        const jsonStr = result[0].values[0][0] as string;
        const loaded = JSON.parse(jsonStr);
        
        // Merge with defaults to ensure all fields exist
        this.config = {
          rules: loaded.rules ?? DEFAULT_SYSTEM_CONFIG.rules,
          globalLimits: {
            ...DEFAULT_SYSTEM_CONFIG.globalLimits,
            ...(loaded.globalLimits || {}),
          },
          ai: {
            ...DEFAULT_SYSTEM_CONFIG.ai!,
            ...(loaded.ai || {}),
          },
        };
      } else {
        // No saved config, use defaults
        this.config = { ...DEFAULT_SYSTEM_CONFIG };
      }
      
      return this.config;
    } catch {
      // Error loading, use defaults
      this.config = { ...DEFAULT_SYSTEM_CONFIG };
      return this.config;
    }
  }

  /**
   * Save configuration to database
   */
  async save(): Promise<void> {
    const jsonStr = JSON.stringify(this.config);
    const updatedAt = new Date().toISOString();
    
    this.db.run(
      `INSERT OR REPLACE INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)`,
      [SETTINGS_KEY, jsonStr, updatedAt]
    );
    
    if (this.persistCallback) {
      await this.persistCallback();
    }
  }

  /**
   * Get current configuration
   */
  get(): SystemConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  async update(newConfig: Partial<SystemConfig>): Promise<SystemConfig> {
    // Ensure current config is loaded from DB if possible
    if (!this.config || Object.keys(this.config.globalLimits).length === 0) {
      await this.load();
    }

    if (newConfig.rules) {
      this.config.rules = newConfig.rules;
    }
    if (newConfig.globalLimits) {
      this.config.globalLimits = {
        ...this.config.globalLimits,
        ...newConfig.globalLimits,
      };
    }
    if (newConfig.ai) {
      const oldAi = this.config.ai || DEFAULT_SYSTEM_CONFIG.ai!;
      this.config.ai = {
        ...oldAi,
        ...newConfig.ai,
        // Preserve API keys if the incoming ones are empty/whitespace
        geminiApiKey: (newConfig.ai.geminiApiKey && newConfig.ai.geminiApiKey.trim()) 
          ? newConfig.ai.geminiApiKey 
          : oldAi.geminiApiKey || '',
        openrouterApiKey: (newConfig.ai.openrouterApiKey && newConfig.ai.openrouterApiKey.trim()) 
          ? newConfig.ai.openrouterApiKey 
          : oldAi.openrouterApiKey || '',
      };
    }
    await this.save();
    return this.config;
  }

  /**
   * Update a single rule
   */
  async updateRule(taskType: string, updates: Partial<ConcurrencyRule>): Promise<ConcurrencyRule | null> {
    const index = this.config.rules.findIndex(r => r.taskType === taskType);
    if (index < 0) return null;

    this.config.rules[index] = {
      ...this.config.rules[index],
      ...updates,
    };
    await this.save();
    return this.config.rules[index];
  }

  /**
   * Update a global limit
   */
  async updateGlobalLimit(resource: ResourceType, limit: number): Promise<void> {
    this.config.globalLimits[resource] = limit;
    await this.save();
  }

  /**
   * Reset to defaults
   */
  async reset(): Promise<SystemConfig> {
    this.config = { ...DEFAULT_SYSTEM_CONFIG };
    await this.save();
    return this.config;
  }
}

// Singleton
let configManagerInstance: ConfigManager | null = null;

export function initConfigManager(db: any, persistCallback?: () => Promise<void>): ConfigManager {
  configManagerInstance = new ConfigManager(db, persistCallback);
  return configManagerInstance;
}

export function getConfigManager(): ConfigManager {
  if (!configManagerInstance) {
    throw new Error('ConfigManager not initialized');
  }
  return configManagerInstance;
}
