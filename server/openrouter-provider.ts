import { OpenRouter } from '@openrouter/sdk';
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

    // Build chat request
    const chatRequest: any = {
      model: this.model,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    };

    // Try structured output first, fallback to json_object if not supported
    let useStructuredOutput = false;
    if (params.responseMimeType === 'application/json' && params.responseSchema) {
      try {
        const jsonSchema = convertGeminiSchemaToJsonSchema(params.responseSchema);
        chatRequest.responseFormat = {
          type: 'json_schema',
          jsonSchema: {
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
      chatRequest.responseFormat = { type: 'json_object' };
    }

    // Call the model using the SDK
    let response: any;
    try {
      response = await this.client.chat.send({ chatRequest });
    } catch (apiError: any) {
      // Log detailed error info
      console.error('[OpenRouter] API call failed:', {
        message: apiError.message,
        rawMessage: apiError.rawMessage,
        rawValue: apiError.rawValue,
        model: this.model,
        useStructuredOutput,
      });

      // If structured output failed, try again with json_object fallback
      if (useStructuredOutput && (
        apiError.message?.includes('validation') ||
        apiError.message?.includes('schema') ||
        apiError.rawMessage?.includes('validation')
      )) {
        console.warn('[OpenRouter] Structured output failed, falling back to json_object mode');
        chatRequest.responseFormat = { type: 'json_object' };
        try {
          response = await this.client.chat.send({ chatRequest });
        } catch (fallbackError: any) {
          console.error('[OpenRouter] Fallback json_object mode also failed:', {
            message: fallbackError.message,
            rawValue: fallbackError.rawValue,
          });
          // Extract upstream error message if available
          const upstreamError = fallbackError.rawValue?.error?.message || fallbackError.message;
          throw new Error(`OpenRouter API failed: ${upstreamError}`);
        }
      } else {
        // Extract upstream error message if available
        const upstreamError = apiError.rawValue?.error?.message || apiError.message;
        throw new Error(`OpenRouter API failed: ${upstreamError}`);
      }
    }

    // Get the text response
    let text = response.choices?.[0]?.message?.content || '';

    // Strip markdown code blocks if present (fallback for models that don't support structured output)
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
      usage: response.usage ? {
        totalTokenCount: (response.usage as any).total_tokens,
        promptTokenCount: (response.usage as any).prompt_tokens,
        candidatesTokenCount: (response.usage as any).completion_tokens,
      } : undefined,
    };
  }
}
