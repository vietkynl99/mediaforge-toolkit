import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenAICompatibleProvider } from './openai-compatible-provider.js';
import { getConfigManager } from './job/config-manager.js';
import type { AiProviderType } from './job/types.js';
import { AI_DEFAULT_MODELS, AI_BASE_URLS } from './constants.js';

/**
 * Get the configured AI provider instance
 */
export function getAiProvider(): AiProvider {
  const configManager = getConfigManager();
  const settings = configManager.get().ai;

  const provider = settings?.provider || 'gemini';

  switch (provider) {
    case 'openrouter': {
      const apiKey = settings?.openrouterApiKey;
      const model = settings?.openrouterModel || AI_DEFAULT_MODELS.openrouter;
      const baseUrl = AI_BASE_URLS.openrouter;
      
      if (!apiKey) {
        throw new Error('OpenRouter API key is not configured in settings');
      }
      
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
    }
    
    case 'openai': {
      const apiKey = settings?.openaiApiKey;
      const model = settings?.openaiModel || AI_DEFAULT_MODELS.openai;
      const baseUrl = AI_BASE_URLS.openai;
      
      if (!apiKey) {
        throw new Error('OpenAI API key is not configured in settings');
      }
      
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
    }
    
    case 'custom': {
      const apiKey = settings?.customApiKey;
      const model = settings?.customModel || AI_DEFAULT_MODELS.custom;
      const baseUrl = settings?.customBaseUrl || AI_BASE_URLS.custom;
      
      if (!apiKey) {
        throw new Error('API key is not configured in settings');
      }
      
      if (!baseUrl) {
        throw new Error('Custom base URL is not configured in settings');
      }
      
      return new OpenAICompatibleProvider({ apiKey, model, baseUrl });
    }
    
    case 'gemini':
    default: {
      const apiKey = settings?.geminiApiKey;
      const model = settings?.geminiModel || AI_DEFAULT_MODELS.gemini;
      
      if (!apiKey) {
        throw new Error('Gemini API key is not configured in settings');
      }
      
      return new GeminiProvider({ apiKey, model });
    }
  }
}

/**
 * Call the configured AI provider
 * This is the main entry point for AI calls
 */
export async function callAi(params: AiCallParams): Promise<AiCallResult> {
  const provider = getAiProvider();
  return provider.call(params);
}

/**
 * Check if the current provider is configured
 */
export function isAiConfigured(): boolean {
  try {
    const provider = getAiProvider();
    return provider.isConfigured();
  } catch {
    return false;
  }
}

/**
 * Get the current provider type
 */
export function getCurrentProviderType(): AiProviderType {
  const configManager = getConfigManager();
  return configManager.get().ai?.provider || 'gemini';
}
