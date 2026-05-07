import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';

export interface OpenRouterConfig {
  apiKey: string;
  model?: string;
}

/**
 * Convert Gemini-style schema (with Type enum) to standard JSON Schema
 */
function convertGeminiSchemaToJsonSchema(geminiSchema: any): any {
  if (!geminiSchema) return undefined;

  const result: any = {};

  // Map Gemini Type enum values to JSON Schema type strings
  const typeMap: Record<string, string> = {
    'STRING': 'string',
    'NUMBER': 'number',
    'INTEGER': 'integer',
    'BOOLEAN': 'boolean',
    'OBJECT': 'object',
    'ARRAY': 'array',
  };

  // Handle type - could be enum value or string
  if (geminiSchema.type !== undefined) {
    const typeValue = typeof geminiSchema.type === 'string'
      ? geminiSchema.type.toUpperCase()
      : String(geminiSchema.type).toUpperCase();
    result.type = typeMap[typeValue] || String(geminiSchema.type).toLowerCase();
  }

  // Copy over standard JSON Schema properties
  if (geminiSchema.description) result.description = geminiSchema.description;
  if (geminiSchema.properties) {
    result.properties = {};
    for (const [key, value] of Object.entries(geminiSchema.properties)) {
      result.properties[key] = convertGeminiSchemaToJsonSchema(value);
    }
  }
  if (geminiSchema.required) result.required = geminiSchema.required;
  if (geminiSchema.items) result.items = convertGeminiSchemaToJsonSchema(geminiSchema.items);
  if (geminiSchema.enum) result.enum = geminiSchema.enum;
  if (geminiSchema.additionalProperties !== undefined) {
    result.additionalProperties = geminiSchema.additionalProperties;
  }

  return result;
}

/**
 * OpenRouter AI Provider implementation
 * Supports multiple AI models through OpenRouter API
 */
export class OpenRouterProvider implements AiProvider {
  readonly name = 'openrouter';
  private apiKey: string;
  private model: string;

  constructor(config: OpenRouterConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'openrouter/auto';
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

    // Build chat request
    const chatRequest: any = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    // Try structured output first
    let useStructuredOutput = false;
    if (params.responseMimeType === 'application/json' && params.responseSchema) {
      try {
        const jsonSchema = convertGeminiSchemaToJsonSchema(params.responseSchema);
        chatRequest.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: jsonSchema,
          },
        };
        useStructuredOutput = true;
      } catch (schemaError) {
        console.warn('Failed to convert schema, falling back to json_object mode:', schemaError);
      }
    }

    // Fallback to json_object mode for JSON requests without valid schema
    if (params.responseMimeType === 'application/json' && !useStructuredOutput) {
      chatRequest.response_format = { type: 'json_object' };
    }

    // Call the model using fetch directly (bypassing SDK to avoid unhandled rejections)
    let response: Response;
    try {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mediaforge.ai', // Optional but recommended by OpenRouter
          'X-Title': 'MediaForge Toolkit',
        },
        body: JSON.stringify(chatRequest),
      });
    } catch (networkError: any) {
      console.error('[OpenRouter] Network error:', networkError.message);
      throw new Error(`OpenRouter connection failed: ${networkError.message}`);
    }

    const responseText = await response.text();
    
    if (!response.ok) {
      let errorDetail = responseText;
      try {
        const errorJson = JSON.parse(responseText);
        errorDetail = errorJson.error?.message || errorJson.message || responseText;
      } catch {
        // Fallback to raw text
      }
      
      console.error('[OpenRouter] API call failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorDetail,
        model: this.model,
      });

      // If structured output failed, we could retry here, but for now we'll just throw
      throw new Error(`OpenRouter API failed (${response.status}): ${errorDetail}`);
    }

    let data: any;
    try {
      if (!responseText) {
        throw new Error('Empty response from OpenRouter');
      }
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      console.error('[OpenRouter] Failed to parse response as JSON:', {
        error: parseError.message,
        text: responseText.substring(0, 500),
      });
      throw new Error(`OpenRouter returned invalid JSON: ${parseError.message}`);
    }

    // Get the text response
    let text = data.choices?.[0]?.message?.content || '';

    // Strip markdown code blocks if present
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

    return {
      text: text || '',
      usage: data.usage ? {
        totalTokenCount: data.usage.total_tokens,
        promptTokenCount: data.usage.prompt_tokens,
        candidatesTokenCount: data.usage.completion_tokens,
      } : undefined,
    };
  }
}
