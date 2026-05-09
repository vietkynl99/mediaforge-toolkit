import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Settings, Save, RotateCcw, AlertCircle, Check, Eye, EyeOff, Zap, Cpu, MemoryStick, Wifi } from 'lucide-react';
import { AI_DEFAULT_MODELS, AI_BASE_URLS, type AiProviderType } from '@/shared/ai-constants';

interface ConcurrencyRule {
  taskType: string;
  maxConcurrent: number;
  resourceType: 'cpu' | 'gpu' | 'network';
  priority: number;
}

interface SystemConfig {
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
    // OpenAI settings
    openaiModel?: string;
    openaiApiKey?: string;
    // Custom provider settings
    customModel?: string;
    customApiKey?: string;
    customBaseUrl?: string;
    // Common settings
    translationBatchSize?: number;
    optimizationBatchSize?: number;
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
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showOpenRouterApiKey, setShowOpenRouterApiKey] = useState(false);
  const [showOpenAiApiKey, setShowOpenAiApiKey] = useState(false);
  const [showCustomApiKey, setShowCustomApiKey] = useState(false);
  const [testingModel, setTestingModel] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  
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

  const saveConfig = useCallback(async (newConfig: SystemConfig) => {
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

  const debouncedSave = useCallback((newConfig: SystemConfig) => {
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
      // Clear test result when changing provider
      if (field === 'provider') {
        setTestResult(null);
        if (value === 'gemini') {
          newAi.geminiModel = newAi.geminiModel || AI_DEFAULT_MODELS.gemini;
        } else if (value === 'openrouter') {
          newAi.openrouterModel = newAi.openrouterModel || AI_DEFAULT_MODELS.openrouter;
        } else if (value === 'openai') {
          newAi.openaiModel = newAi.openaiModel || AI_DEFAULT_MODELS.openai;
        } else if (value === 'custom') {
          newAi.customModel = newAi.customModel || AI_DEFAULT_MODELS.custom;
          newAi.customBaseUrl = newAi.customBaseUrl || AI_BASE_URLS.custom;
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

  const testModel = useCallback(async () => {
    if (!config?.ai) return;
    
    setTestingModel(true);
    setTestResult(null);
    
    try {
      const response = await fetch('/api/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: config.ai.provider, aiConfig: config.ai }),
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        setTestResult({ success: true, message: data.message || 'Model is working!' });
      } else {
        setTestResult({ success: false, message: data.error || 'Test failed' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setTestingModel(false);
    }
  }, [config?.ai]);

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
            <Zap size={14} />
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
              <option value="openai">OpenAI (GPT-4, GPT-4o...)</option>
              <option value="openrouter">OpenRouter (Multi-model)</option>
              <option value="custom">Custom (OpenAI-Compatible)</option>
            </select>
          </div>

          {/* Gemini Settings */}
          {(config.ai?.provider || 'gemini') === 'gemini' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Model
                </label>
                <select
                  value={config.ai?.geminiModel || config.ai?.model || 'gemini-2.5-flash'}
                  onChange={e => updateAiSetting('geminiModel', e.target.value)}
                  className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
                >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                </select>
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.geminiApiKey || ''}
                  onChange={e => updateAiSetting('geminiApiKey', e.target.value)}
                    placeholder="Enter your API Key"
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
              
              {/* Test Model Button */}
              <div className="pt-2 border-t border-zinc-700/50">
                <button
                  type="button"
                  onClick={testModel}
                  disabled={testingModel || !config.ai?.geminiApiKey}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {testingModel ? (
                    <>
                      <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      Test Model
                    </>
                  )}
                </button>
                
                {testResult && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-900/20 border border-green-800/30 text-green-400' : 'bg-red-900/20 border border-red-800/30 text-red-400'}`}>
                    {testResult.success ? <Check size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OpenAI Settings */}
          {(config.ai?.provider || 'gemini') === 'openai' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={config.ai?.openaiModel || AI_DEFAULT_MODELS.openai}
                  onChange={e => updateAiSetting('openaiModel', e.target.value)}
                    placeholder="e.g., gpt-4o"
                  className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showOpenAiApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.openaiApiKey || ''}
                  onChange={e => updateAiSetting('openaiApiKey', e.target.value)}
                    placeholder="Enter your API Key"
                  className="w-full px-3 py-2 pr-10 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenAiApiKey(prev => !prev)}
                  className="absolute right-3 top-[29px] p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {showOpenAiApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                </div>
              </div>
              <p className="text-[10px] text-zinc-500">
                See models at <a href="https://platform.openai.com/docs/models" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">platform.openai.com/docs/models</a>
              </p>
              
              {/* Test Model Button */}
              <div className="pt-2 border-t border-zinc-700/50">
                <button
                  type="button"
                  onClick={testModel}
                  disabled={testingModel || !config.ai?.openaiApiKey}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {testingModel ? (
                    <>
                      <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      Test Model
                    </>
                  )}
                </button>
                
                {testResult && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-900/20 border border-green-800/30 text-green-400' : 'bg-red-900/20 border border-red-800/30 text-red-400'}`}>
                    {testResult.success ? <Check size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* OpenRouter Settings */}
          {(config.ai?.provider || 'gemini') === 'openrouter' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={config.ai?.openrouterModel || AI_DEFAULT_MODELS.openrouter}
                  onChange={e => updateAiSetting('openrouterModel', e.target.value)}
                    placeholder="e.g., openrouter/auto"
                  className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                    API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showOpenRouterApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.openrouterApiKey || ''}
                  onChange={e => updateAiSetting('openrouterApiKey', e.target.value)}
                    placeholder="Enter your API Key"
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
              </div>
              <p className="text-[10px] text-zinc-500">
                Browse models at <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">openrouter.ai/models</a>
              </p>
              
              {/* Test Model Button */}
              <div className="pt-2 border-t border-zinc-700/50">
                <button
                  type="button"
                  onClick={testModel}
                  disabled={testingModel || !config.ai?.openrouterApiKey}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {testingModel ? (
                    <>
                      <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      Test Model
                    </>
                  )}
                </button>
                
                {testResult && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-900/20 border border-green-800/30 text-green-400' : 'bg-red-900/20 border border-red-800/30 text-red-400'}`}>
                    {testResult.success ? <Check size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Custom OpenAI-Compatible Settings */}
          {(config.ai?.provider || 'gemini') === 'custom' && (
            <div className="space-y-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
              <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Model
                </label>
                <input
                  type="text"
                  value={config.ai?.customModel || AI_DEFAULT_MODELS.custom}
                  onChange={e => updateAiSetting('customModel', e.target.value)}
                    placeholder="e.g., gpt-4o"
                  className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
              <div className="relative">
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  API Key
                </label>
                <input
                  type="text"
                  autoComplete="off"
                  style={{ WebkitTextSecurity: showCustomApiKey ? 'none' : 'disc' } as React.CSSProperties}
                  value={config.ai?.customApiKey || ''}
                  onChange={e => updateAiSetting('customApiKey', e.target.value)}
                  placeholder="Enter your API Key"
                  className="w-full px-3 py-2 pr-10 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowCustomApiKey(prev => !prev)}
                  className="absolute right-3 top-[29px] p-1 text-zinc-400 hover:text-zinc-200"
                >
                  {showCustomApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                </div>
              </div>
              
              {/* Custom Base URL */}
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                  Base URL
                </label>
                <input
                  type="text"
                  value={config.ai?.customBaseUrl || AI_BASE_URLS.custom}
                  onChange={e => updateAiSetting('customBaseUrl', e.target.value)}
                  placeholder="http://localhost:20128/v1"
                  className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Examples: <a href="https://github.com/decolua/9router" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">9Router</a> (localhost:20128/v1), <a href="https://lmstudio.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">LM Studio</a>, <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">Ollama</a>, or any OpenAI-compatible endpoint.
                </p>
              </div>
              
              {/* Test Model Button */}
              <div className="pt-2 border-t border-zinc-700/50">
                <button
                  type="button"
                  onClick={testModel}
                  disabled={testingModel || !config.ai?.customApiKey || !config.ai?.customBaseUrl}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  {testingModel ? (
                    <>
                      <div className="animate-spin w-3 h-3 border border-white border-t-transparent rounded-full" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <Zap size={12} />
                      Test Model
                    </>
                  )}
                </button>
                
                {testResult && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-start gap-2 ${testResult.success ? 'bg-green-900/20 border border-green-800/30 text-green-400' : 'bg-red-900/20 border border-red-800/30 text-red-400'}`}>
                    {testResult.success ? <Check size={14} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                Translation Batch Size
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={config.ai?.translationBatchSize || 50}
                onChange={e => updateAiSetting('translationBatchSize', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                Optimization Batch Size
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={config.ai?.optimizationBatchSize || 30}
                onChange={e => updateAiSetting('optimizationBatchSize', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider block mb-2">
                Max Words per Line
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={config.ai?.maxSingleLineWords || 10}
                onChange={e => updateAiSetting('maxSingleLineWords', parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm text-zinc-100 bg-zinc-800 border border-zinc-700 rounded-lg focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="autoSplit"
                checked={config.ai?.autoSplitLongLines ?? true}
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
