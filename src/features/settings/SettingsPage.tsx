import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Save, RotateCcw, Cpu, Wifi, MemoryStick, AlertCircle, Check, Sparkles, Eye, EyeOff } from 'lucide-react';

interface ConcurrencyRule {
  taskType: string;
  maxConcurrent: number;
  resourceType: 'cpu' | 'gpu' | 'network';
  priority: number;
}

type AiProviderType = 'gemini' | 'openrouter';

interface ConcurrencyConfig {
  rules: ConcurrencyRule[];
  globalLimits: {
    cpu: number;
    gpu: number;
    network: number;
  };
  ai?: {
    provider?: AiProviderType;
    // Legacy fields
    model?: AiModel;
    apiKey?: string;
    // Gemini settings
    geminiModel?: string;
    geminiApiKey?: string;
    // OpenRouter settings
    openrouterModel?: string;
    openrouterApiKey?: string;
    // Common settings
    translationBatchSize?: number;
    maxSingleLineWords?: number;
    autoSplitLongLines?: boolean;
    cpsThreshold?: {
      safeMax: number;
      warningMax: number;
    };
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

type AiModel = 'gemini-2.5-flash' | 'gemini-2.5-pro' | 'gemini-3-flash-preview' | 'gemini-3-pro-preview';

export function SettingsPage() {
  const [config, setConfig] = useState<ConcurrencyConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOpenRouterApiKey, setShowOpenRouterApiKey] = useState(false);
  
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadConfig();
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
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

  const saveConfig = useCallback(async (newConfig: ConcurrencyConfig) => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const response = await fetch('/api/settings/concurrency', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (!response.ok) throw new Error('Failed to save config');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  }, []);

  const debouncedSave = useCallback((newConfig: ConcurrencyConfig) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveConfig(newConfig);
    }, 1000);
  }, [saveConfig]);

  const updateGlobalLimit = (resource: string, value: number) => {
    if (!config) return;
    const newConfig = {
      ...config,
      globalLimits: {
        ...config.globalLimits,
        [resource]: Math.max(1, value),
      },
    };
    setConfig(newConfig);
    debouncedSave(newConfig);
  };

  const updateRule = (taskType: string, field: 'maxConcurrent' | 'priority', value: number) => {
    if (!config) return;
    const newConfig = {
      ...config,
      rules: config.rules.map(rule =>
        rule.taskType === taskType ? { ...rule, [field]: Math.max(1, value) } : rule
      ),
    };
    setConfig(newConfig);
    debouncedSave(newConfig);
  };

  const updateAiSetting = (field: string, value: any) => {
    if (!config) return;
    
    const currentAi = config.ai || { provider: 'gemini', model: 'gemini-2.5-flash', apiKey: '' };
    let newAi: any = { ...currentAi };
    
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      if (parent === 'cpsThreshold') {
        newAi.cpsThreshold = {
          ...(currentAi.cpsThreshold || { safeMax: 25, warningMax: 40 }),
          [child]: value
        };
      }
    } else {
      newAi[field] = value;
      // When changing provider, set default model for that provider
      if (field === 'provider') {
        if (value === 'gemini') {
          newAi.geminiModel = newAi.geminiModel || 'gemini-2.5-flash';
        } else if (value === 'openrouter') {
          newAi.openrouterModel = newAi.openrouterModel || 'openrouter/auto';
        }
      }
    }

    const newConfig = {
      ...config,
      ai: newAi
    };
    setConfig(newConfig);
    debouncedSave(newConfig);
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
        <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-amber-400 flex items-center gap-1">
              <div className="animate-spin w-3 h-3 border border-amber-400 border-t-transparent rounded-full" />
              Saving...
            </span>
          )}
          {success && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <Check size={12} /> Saved
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-900/20 border border-red-800/50 rounded-lg text-sm text-red-400 flex items-center gap-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* AI Settings */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
            <Sparkles size={14} />
            AI Settings
          </h2>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
              AI Provider
            </label>
            <select
              value={config.ai?.provider || 'gemini'}
              onChange={e => updateAiSetting('provider', e.target.value)}
              className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
            >
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter (Multi-model)</option>
            </select>
          </div>

          {/* Gemini Settings */}
          {(config.ai?.provider || 'gemini') === 'gemini' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Gemini Configuration
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    Model
                  </label>
                  <select
                    value={config.ai?.geminiModel || config.ai?.model || 'gemini-2.5-flash'}
                    onChange={e => updateAiSetting('geminiModel', e.target.value)}
                    className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fast)</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro (Balanced)</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro Preview (Highest Quality)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    Translation Batch Size
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={config.ai?.translationBatchSize || 100}
                    onChange={e => updateAiSetting('translationBatchSize', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Gemini API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.geminiApiKey || config.ai?.apiKey || ''}
                  onChange={e => updateAiSetting('geminiApiKey', e.target.value)}
                  placeholder="Enter your Gemini API Key"
                  className="w-full px-3 py-2 pr-10 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(prev => !prev)}
                  className="absolute right-3 top-[29px] p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          )}

          {/* OpenRouter Settings */}
          {(config.ai?.provider || 'gemini') === 'openrouter' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="text-xs text-zinc-400 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-500" />
                OpenRouter Configuration
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={config.ai?.openrouterModel || 'openrouter/auto'}
                    onChange={e => updateAiSetting('openrouterModel', e.target.value)}
                    placeholder="e.g., openrouter/auto, anthropic/claude-3-opus"
                    className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Browse models at <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">openrouter.ai/models</a>.
                  </p>
                </div>
                <div>
                  <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    Translation Batch Size
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={config.ai?.translationBatchSize || 100}
                    onChange={e => updateAiSetting('translationBatchSize', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  OpenRouter API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showOpenRouterApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.openrouterApiKey || ''}
                  onChange={e => updateAiSetting('openrouterApiKey', e.target.value)}
                  placeholder="Enter your OpenRouter API Key"
                  className="w-full px-3 py-2 pr-10 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenRouterApiKey(prev => !prev)}
                  className="absolute right-3 top-[29px] p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {showOpenRouterApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <p className="text-[10px] text-zinc-500">
                Get your API key from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">openrouter.ai/keys</a>
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                Max Words per Line
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={config.ai?.maxSingleLineWords || 12}
                onChange={e => updateAiSetting('maxSingleLineWords', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="autoSplit"
                checked={config.ai?.autoSplitLongLines || false}
                onChange={e => updateAiSetting('autoSplitLongLines', e.target.checked)}
                className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="autoSplit" className="text-sm text-zinc-300 cursor-pointer">
                Auto split long lines
              </label>
            </div>
          </div>

          <div className="pt-2 border-t border-zinc-800">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-3">
              CPS Thresholds
            </label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-400 font-medium">Safe Max</span>
                  <span className="text-[10px] text-green-400 font-bold">{config.ai?.cpsThreshold?.safeMax || 25} CPS</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={40}
                  value={config.ai?.cpsThreshold?.safeMax || 25}
                  onChange={e => updateAiSetting('cpsThreshold.safeMax', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-zinc-400 font-medium">Warning Max</span>
                  <span className="text-[10px] text-amber-400 font-bold">{config.ai?.cpsThreshold?.warningMax || 40} CPS</span>
                </div>
                <input
                  type="range"
                  min={30}
                  max={60}
                  value={config.ai?.cpsThreshold?.warningMax || 40}
                  onChange={e => updateAiSetting('cpsThreshold.warningMax', parseInt(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

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
                <th className="text-left text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider px-2 md:px-4 py-3">Task Type</th>
                <th className="text-left text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider px-2 md:px-4 py-3">Resource</th>
                <th className="text-center text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider px-2 md:px-4 py-3">Max</th>
                <th className="text-center text-[9px] md:text-[10px] text-zinc-500 uppercase tracking-wider px-2 md:px-4 py-3">Pri</th>
              </tr>
            </thead>
            <tbody>
              {config.rules.map(rule => (
                <tr key={rule.taskType} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                  <td className="px-2 md:px-4 py-3 text-xs md:text-sm text-zinc-200">
                    <span className="md:hidden">{rule.taskType.charAt(0).toUpperCase() + rule.taskType.slice(1)}</span>
                    <span className="hidden md:inline">{TASK_TYPE_LABELS[rule.taskType] || rule.taskType}</span>
                  </td>
                  <td className="px-2 md:px-4 py-3 text-xs md:text-sm text-zinc-400">
                    <div className="flex items-center gap-1 md:gap-1.5 whitespace-nowrap">
                      {RESOURCE_ICONS[rule.resourceType]}
                      <span>{RESOURCE_LABELS[rule.resourceType] || rule.resourceType}</span>
                    </div>
                  </td>
                  <td className="px-2 md:px-4 py-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={rule.maxConcurrent}
                      onChange={e => updateRule(rule.taskType, 'maxConcurrent', parseInt(e.target.value) || 1)}
                      className="w-10 md:w-16 px-1 py-1 text-xs md:text-sm text-center text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 md:px-4 py-3 text-center">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={rule.priority}
                      onChange={e => updateRule(rule.taskType, 'priority', parseInt(e.target.value) || 1)}
                      className="w-10 md:w-16 px-1 py-1 text-xs md:text-sm text-center text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
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
