import { GoogleGenAI } from '@google/genai';
import { getConfigManager } from './job/config-manager.js';

export interface AiTaskParams {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

export async function callGemini(params: AiTaskParams) {
  const configManager = getConfigManager();
  const settings = configManager.get().ai;

  if (!settings?.apiKey) {
    throw new Error('Gemini API key is not configured in settings');
  }

  const ai = new GoogleGenAI({ apiKey: settings.apiKey });
  
  const response = await ai.models.generateContent({
    model: settings.model || 'gemini-2.5-flash',
    contents: params.prompt,
    config: {
      temperature: params.temperature ?? 1,
      responseMimeType: params.responseMimeType,
      responseSchema: params.responseSchema,
      systemInstruction: params.systemInstruction,
    },
  });

  return {
    text: response.text?.trim() || '',
    usage: response.usageMetadata
  };
}
