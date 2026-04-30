import React, { useEffect, useState } from 'react';
import { Save, RotateCcw, Cpu, Wifi, MemoryStick, AlertCircle, Check } from 'lucide-react';

interface ConcurrencyRule {
  taskType: string;
  maxConcurrent: number;
  resourceType: 'cpu' | 'gpu' | 'network';
  priority: number;
}

interface ConcurrencyConfig {
  rules: ConcurrencyRule[];
  globalLimits: {
    cpu: number;
    gpu: number;
    network: number;
  };
}

const RESOURCE_ICONS: Record<string, React.ReactNode> = {
  cpu: <Cpu size={14} />,
  gpu: <MemoryStick size={14} />,
  network: <Wifi size={14} />,
};

const RESOURCE_LABELS: Record<string, string> = {
  cpu: 'CPU',
  gpu: 'GPU',
  network: 'Network',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  download: 'Download',
  uvr: 'Vocal Removal (UVR)',
  tts: 'Text-to-Speech',
  render: 'Video Render',
};

export function SettingsPage() {
  const [config, setConfig] = useState<ConcurrencyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/concurrency');
      if (!response.ok) throw new Error('Failed to load config');
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch('/api/settings/concurrency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error('Failed to save config');
      setSuccess(true);
      setHasChanges(false);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const resetConfig = async () => {
    if (!confirm('Reset to default configuration?')) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/settings/concurrency/reset', { method: 'POST' });
      if (!response.ok) throw new Error('Failed to reset config');
      const data = await response.json();
      setConfig(data);
      setHasChanges(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset config');
    } finally {
      setLoading(false);
    }
  };

  const updateGlobalLimit = (resource: string, value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      globalLimits: {
        ...config.globalLimits,
        [resource]: Math.max(1, value),
      },
    });
    setHasChanges(true);
  };

  const updateRule = (taskType: string, field: 'maxConcurrent' | 'priority', value: number) => {
    if (!config) return;
    setConfig({
      ...config,
      rules: config.rules.map(rule =>
        rule.taskType === taskType ? { ...rule, [field]: Math.max(1, value) } : rule
      ),
    });
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="p-8 text-sm text-zinc-500 flex items-center gap-2">
        <div className="animate-spin w-4 h-4 border-2 border-zinc-500 border-t-transparent rounded-full" />
        Loading settings...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-8 text-sm text-red-400 flex items-center gap-2">
        <AlertCircle size={16} />
        {error || 'Failed to load configuration'}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Concurrency Settings</h1>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          )}
          {success && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
          <button
            onClick={resetConfig}
            className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg hover:border-zinc-600 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            onClick={saveConfig}
            disabled={saving || !hasChanges}
            className="px-3 py-1.5 text-xs text-zinc-100 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Save size={12} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Global Limits */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Cpu size={14} />
          Global Resource Limits
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-4">
            Maximum concurrent tasks per resource type across all jobs.
          </p>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(config.globalLimits).map(([resource, limit]) => (
              <div key={resource} className="flex flex-col gap-1.5">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  {RESOURCE_ICONS[resource]}
                  {RESOURCE_LABELS[resource] || resource}
                </label>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={limit}
                  onChange={e => updateGlobalLimit(resource, parseInt(e.target.value) || 1)}
                  className="w-full px-2 py-1.5 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Task Rules */}
      <section>
        <h2 className="text-sm font-medium text-zinc-300 mb-3 flex items-center gap-2">
          <Cpu size={14} />
          Task Concurrency Rules
        </h2>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left text-[11px] text-zinc-500 uppercase tracking-wider px-4 py-3">Task Type</th>
                <th className="text-left text-[11px] text-zinc-500 uppercase tracking-wider px-4 py-3">Resource</th>
                <th className="text-center text-[11px] text-zinc-500 uppercase tracking-wider px-4 py-3">Max Concurrent</th>
                <th className="text-center text-[11px] text-zinc-500 uppercase tracking-wider px-4 py-3">Priority</th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map(rule => (
                <tr key={rule.taskType} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-4 py-3 text-sm text-zinc-200">
                    {TASK_TYPE_LABELS[rule.taskType] || rule.taskType}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400 flex items-center gap-1.5">
                    {RESOURCE_ICONS[rule.resourceType]}
                    {RESOURCE_LABELS[rule.resourceType] || rule.resourceType}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={rule.maxConcurrent}
                      onChange={e => updateRule(rule.taskType, 'maxConcurrent', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 text-sm text-center text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={rule.priority}
                      onChange={e => updateRule(rule.taskType, 'priority', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 text-sm text-center text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          Higher priority tasks are scheduled first when resources are available.
        </p>
      </section>
    </div>
  );
}
