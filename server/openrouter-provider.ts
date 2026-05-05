import { OpenRouter } from '@openrouter/sdk';
import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
}

/**
 * OpenRouter AI Provider implementation
 * Supports multiple AI models through OpenRouter API
 */
export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private model: string;
  private client: OpenRouter;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'openrouter/auto';
    this.client = new OpenRouter({ apiKey: this.apiKey });
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async call(params: AiCallParams): Promise<AiCallResult> {
    if (!this.isConfigured()) {
      throw new Error('OpenRouter API key is not configured');
    }

    // Build messages array
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    
    // Add system instruction to ensure JSON output
    const systemBase = params.systemInstruction || 'You are a helpful assistant.';
    const jsonInstruction = params.responseMimeType === 'application/json' 
      ? '\n\nIMPORTANT: You must respond with valid JSON only. Do not include any markdown code blocks, explanations, or other text outside the JSON.'
      : '';
    
    messages.push({ role: 'system', content: systemBase + jsonInstruction });
    messages.push({ role: 'user', content: params.prompt });

    // Call the model
    const result = this.client.callModel({
      model: this.model,
      input: messages,
    });

    // Get the text response
    let text = await result.getText();
    
    // Strip markdown code blocks if present (models often wrap JSON in ```json ... ```)
    if (text) {
      text = text.trim();
      // Remove ```json or ``` at the start
      if (text.startsWith('```json')) {
        text = text.slice(7);
      } else if (text.startsWith('```')) {
        text = text.slice(3);
      }
      // Remove ``` at the end
      if (text.endsWith('```')) {
        text = text.slice(0, -3);
      }
      text = text.trim();
    }
    
    // Get usage info from the response
    const response = await result.getResponse();
    
    return {
      text: text || '',
      usage: response?.usage ? {
        totalTokenCount: (response.usage as any).totalTokens || (response.usage as any).total_tokens,
        promptTokenCount: (response.usage as any).promptTokens || (response.usage as any).prompt_tokens,
        candidatesTokenCount: (response.usage as any).completionTokens || (response.usage as any).completion_tokens,
      } : undefined,
    };
  }
}
