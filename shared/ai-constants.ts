/**
 * AI Provider Constants - shared between server and client
 */

export const AI_DEFAULT_MODELS = {
  gemini: 'gemini-2.5-flash',
  openrouter: 'openrouter/auto',
  openai: 'gpt-4o',
  custom: 'gpt-4o',
} as const;

export const AI_BASE_URLS = {
  openrouter: 'https://openrouter.ai/api/v1',
  openai: 'https://api.openai.com/v1',
  custom: 'http://localhost:20128/v1',  // Default for custom (e.g., 9Router)
} as const;

export type AiProviderType = 'gemini' | 'openrouter' | 'openai' | 'custom';
