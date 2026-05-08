import { GoogleGenAI, Type } from '@google/genai';
import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

/**
 * Gemini AI Provider implementation
 */
export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(config: GeminiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.5-flash';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async call(params: AiCallParams): Promise<AiCallResult> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key is not configured');
    }

    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const requestPromise = ai.models.generateContent({
      model: this.model,
      contents: params.prompt,
      config: {
        temperature: params.temperature ?? 1,
        responseMimeType: params.responseMimeType,
        responseSchema: params.responseSchema,
        systemInstruction: params.systemInstruction,
      },
    });
    const response = await raceWithAbort(requestPromise, params.signal);

    return {
      text: response.text?.trim() || '',
      usage: response.usageMetadata ? {
        totalTokenCount: response.usageMetadata.totalTokenCount,
        promptTokenCount: response.usageMetadata.promptTokenCount,
        candidatesTokenCount: response.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) throw new Error('Task cancelled');
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error('Task cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      value => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      err => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use GeminiProvider directly or getAiProvider() factory
 */
export async function callGemini(params: AiCallParams): Promise<AiCallResult> {
  const { getConfigManager } = await import('./job/config-manager.js');
  const configManager = getConfigManager();
  const settings = configManager.get().ai;

  const apiKey = settings?.geminiApiKey;
  const model = settings?.geminiModel;

  if (!apiKey) {
    throw new Error('Gemini API key is not configured in settings');
  }

  const provider = new GeminiProvider({
    apiKey,
    model,
  });

  return provider.call(params);
}
