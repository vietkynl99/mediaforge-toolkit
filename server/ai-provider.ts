import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { getConfigManager } from './job/config-manager.js';
import type { AiProviderType } from './job/types.js';

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
      const model = settings?.openrouterModel || 'openrouter/auto';
      
      if (!apiKey) {
        throw new Error('OpenRouter API key is not configured in settings');
      }
      
      return new OpenRouterProvider({ apiKey, model });
    }
    
    case 'gemini':
    default: {
      const apiKey = settings?.geminiApiKey;
      const model = settings?.geminiModel || 'gemini-2.5-flash';
      
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
