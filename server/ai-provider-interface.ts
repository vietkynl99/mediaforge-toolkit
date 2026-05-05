import type { AiCallParams, AiCallResult } from '../shared/types.js';

/**
 * Interface for AI providers (Gemini, OpenRouter, etc.)
 */
export interface AiProvider {
  readonly name: string;
  
  /**
   * Call the AI model with the given parameters
   */
  call(params: AiCallParams): Promise<AiCallResult>;
  
  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean;
}
