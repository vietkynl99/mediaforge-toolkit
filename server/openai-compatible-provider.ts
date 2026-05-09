import type { AiCallParams, AiCallResult } from '../shared/types.js';
import type { AiProvider } from './ai-provider-interface.js';

export interface OpenAICompatibleConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;  // Custom endpoint for OpenAI-compatible APIs (e.g., OpenRouter, 9Router)
}

/**
 * Model information from OpenAI-compatible API
 */
export interface OpenAICompatibleModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
  pricing: {
    prompt: number;  // Price per 1M tokens
    completion: number;  // Price per 1M tokens
  };
  supportedParameters: string[];
  supportsStructuredOutput: boolean;
  topProvider?: string;
}

/**
 * Cached models data
 */
interface ModelsCache {
  models: Map<string, OpenAICompatibleModelInfo>;
  apiKeyHash: string;  // To detect API key changes
}

let modelsCache: ModelsCache | null = null;
let isFetching: Promise<Map<string, OpenAICompatibleModelInfo>> | null = null;

/**
 * Simple hash for API key comparison (not cryptographically secure)
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Fetch and cache model information from OpenAICompatible API
 * Only fetches when API key changes or cache is empty
 */
async function fetchModelsIfNeeded(apiKey: string, baseUrl: string = 'https://openrouter.ai/api/v1'): Promise<Map<string, OpenAICompatibleModelInfo>> {
  const keyHash = simpleHash(apiKey + baseUrl);
  
  // Return cached data if API key or baseUrl hasn't changed
  if (modelsCache && modelsCache.apiKeyHash === keyHash && modelsCache.models.size > 0) {
    return modelsCache.models;
  }

  // If already fetching, wait for the existing promise
  if (isFetching) {
    return isFetching;
  }
  
  isFetching = (async () => {
    console.log(`[OpenAI-Compatible] Fetching models list from ${baseUrl}...`);
    
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      
      if (!response.ok) {
        console.warn('[OpenAI-Compatible] Failed to fetch models list');
        return modelsCache?.models || new Map();
      }
      
      const data = await response.json();
      const models = data?.data || [];
      
      // Build map of model info
      const modelsMap = new Map<string, OpenAICompatibleModelInfo>();
      for (const model of models) {
        const supportedParams = model?.supported_parameters || [];
        // Only 'structured_outputs' indicates support for json_schema with strict mode
        // 'response_format' may only support basic json_object mode, not structured outputs
        const supportsStructured = supportedParams.includes('structured_outputs');
        
        const info: OpenAICompatibleModelInfo = {
          id: model.id,
          name: model.name || model.id,
          description: model.description,
          contextLength: model.context_length || 4096,
          pricing: {
            prompt: model.pricing?.prompt || 0,
            completion: model.pricing?.completion || 0,
          },
          supportedParameters: supportedParams,
          supportsStructuredOutput: supportsStructured,
          topProvider: model.top_provider?.method || model.provider?.name,
        };
        modelsMap.set(model.id, info);
      }
      
      modelsCache = {
        models: modelsMap,
        apiKeyHash: keyHash,
      };
      
      console.log(`[OpenAI-Compatible] Cached ${modelsMap.size} models`);
      return modelsMap;
    } catch (error) {
      console.warn('[OpenAI-Compatible] Error fetching models list:', error);
      return modelsCache?.models || new Map();
    } finally {
      isFetching = null;
    }
  })();

  return isFetching;
}

/**
 * Get info for a specific model
 */
async function getModelInfo(modelId: string, apiKey: string, baseUrl?: string): Promise<OpenAICompatibleModelInfo | undefined> {
  const models = await fetchModelsIfNeeded(apiKey, baseUrl);
  return models.get(modelId);
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
 * OpenAICompatible AI Provider implementation
 * Supports multiple AI models through OpenAICompatible API
 */
export class OpenAICompatibleProvider implements AiProvider {
  readonly name = 'openai-compatible';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: OpenAICompatibleConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey.length > 0;
  }

  async call(params: AiCallParams): Promise<AiCallResult> {
    const { onLog } = params;
    const log = (msg: string) => {
      if (onLog) onLog(`[OpenAICompatible] ${msg}`);
      else console.log(`[OpenAICompatible] ${msg}`);
    };
    const warn = (msg: string) => {
      if (onLog) onLog(`[OpenAICompatible] WARNING: ${msg}`);
      else console.warn(`[OpenAICompatible] ${msg}`);
    };
    const errorLog = (msg: string) => {
      if (onLog) onLog(`[OpenAICompatible] ERROR: ${msg}`);
      else console.error(`[OpenAICompatible] ${msg}`);
    };

    if (!this.isConfigured()) {
      throw new Error('OpenAICompatible API key is not configured');
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
      stream: false,  // Explicitly disable streaming to ensure JSON response
    };

    // Try structured output first (only if model supports it)
    let useStructuredOutput = false;
    let useToolForJson = false;
    
    if (params.responseMimeType === 'application/json' && params.responseSchema) {
      try {
        // Check if model supports structured outputs
        const modelInfo = await getModelInfo(this.model, this.apiKey, this.baseUrl);
        const jsonSchema = convertGeminiSchemaToJsonSchema(params.responseSchema);
        
        if (modelInfo?.supportsStructuredOutput) {
          chatRequest.response_format = {
            type: 'json_schema',
            json_schema: {
              name: 'response',
              strict: true,
              schema: jsonSchema,
            },
          };
          useStructuredOutput = true;
        } else {
          // Fallback to Tools (Function Calling) if structured output is not supported
          warn(`Model '${this.model}' does not support structured outputs, using Tools as fallback`);
          chatRequest.tools = [
            {
              type: 'function',
              function: {
                name: 'submit_response',
                description: 'Submit the final response in the requested JSON format',
                parameters: jsonSchema,
              },
            }
          ];
          chatRequest.tool_choice = {
            type: 'function',
            function: { name: 'submit_response' }
          };
          useToolForJson = true;
          
          // Update system instruction to be more explicit about tool usage
          if (messages[0]?.role === 'system') {
            messages[0].content += '\n\nIMPORTANT: You must use the "submit_response" tool to provide your final output.';
          }
        }
      } catch (schemaError) {
        warn(`Failed to convert schema or setup tools, falling back to json_object mode: ${schemaError instanceof Error ? schemaError.message : String(schemaError)}`);
      }
    }

    // Fallback to json_object mode for JSON requests without valid schema or if both structured/tools failed to setup
    if (params.responseMimeType === 'application/json' && !useStructuredOutput && !useToolForJson) {
      chatRequest.response_format = { type: 'json_object' };
    }

    // Call the model using fetch directly (bypassing SDK to avoid unhandled rejections)
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://mediaforge.ai', // Optional, site identifier for providers
          'X-Title': 'MediaForge Toolkit',
        },
        body: JSON.stringify(chatRequest),
        signal: params.signal,
      });
    } catch (networkError: any) {
      if (networkError?.name === 'AbortError' || params.signal?.aborted) {
        throw new Error('Task cancelled');
      }
      errorLog(`Network error: ${networkError.message}`);
      throw new Error(`OpenAICompatible connection failed: ${networkError.message}`);
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
      
      errorLog(`API call failed: ${response.status} ${response.statusText} - ${errorDetail} (model: ${this.model})`);

      // If structured output failed, retry with json_object mode
      if (useStructuredOutput && params.responseMimeType === 'application/json') {
        warn('Structured output failed, retrying with json_object mode...');
        chatRequest.response_format = { type: 'json_object' };
        
        const retryResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://mediaforge.ai',
            'X-Title': 'MediaForge Toolkit',
          },
          body: JSON.stringify(chatRequest),
          signal: params.signal,
        });
        
        if (retryResponse.ok) {
          const retryText = await retryResponse.text();
          if (retryText) {
            try {
              const retryData = JSON.parse(retryText);
              const retryContent = retryData.choices?.[0]?.message?.content || '';
              if (retryContent) {
                log('Retry with json_object mode succeeded');
                // Process retry response
                let text = retryContent.trim();
                if (text.startsWith('```json')) text = text.slice(7);
                else if (text.startsWith('```')) text = text.slice(3);
                if (text.endsWith('```')) text = text.slice(0, -3);
                text = text.trim();
                
                return {
                  text: text || '',
                  usage: retryData.usage ? {
                    totalTokenCount: retryData.usage.total_tokens,
                    promptTokenCount: retryData.usage.prompt_tokens,
                    candidatesTokenCount: retryData.usage.completion_tokens,
                  } : undefined,
                };
              }
            } catch {
              // Retry also failed, fall through to throw original error
            }
          }
        }
      }
      
      throw new Error(`OpenAICompatible API failed (${response.status}): ${errorDetail}`);
    }

    let data: any;
    try {
      if (!responseText) {
        throw new Error('Empty response from OpenAICompatible');
      }
      data = JSON.parse(responseText);
    } catch (parseError: any) {
      errorLog(`Failed to parse response as JSON: ${parseError.message}`);
      errorLog(`Response preview: ${responseText.substring(0, 500)}`);
      throw new Error(`OpenAICompatible returned invalid JSON: ${parseError.message}`);
    }

    // Get the text response
    let text = data.choices?.[0]?.message?.content || '';
    
    // If we used a tool for JSON output, extract the arguments from tool_calls
    if (useToolForJson && data.choices?.[0]?.message?.tool_calls?.length > 0) {
      const toolCall = data.choices[0].message.tool_calls.find((tc: any) => tc.function?.name === 'submit_response');
      if (toolCall?.function?.arguments) {
        log('Extracted JSON from tool_calls');
        let extractedText = toolCall.function.arguments;
        
        // Advanced extraction: if model wrapped array in an object like {"response": [...]}, unwrap it
        try {
          const parsed = JSON.parse(extractedText);
          if (!Array.isArray(parsed) && typeof parsed === 'object' && parsed !== null) {
            const values = Object.values(parsed);
            const firstArray = values.find(v => Array.isArray(v));
            if (firstArray) {
              log('Unwrapped array from model response object');
              extractedText = JSON.stringify(firstArray);
            }
          }
        } catch (e) {
          // If parsing fails here, let the main flow handle it
        }
        
        text = extractedText;
      }
    }
    
    // If structured output returned empty content, retry with json_object mode
    if (!text && useStructuredOutput && params.responseMimeType === 'application/json') {
      warn('Structured output returned empty response, retrying with json_object mode...');
      chatRequest.response_format = { type: 'json_object' };
      
      try {
        const retryResponse = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://mediaforge.ai',
            'X-Title': 'MediaForge Toolkit',
          },
          body: JSON.stringify(chatRequest),
          signal: params.signal,
        });
        
        if (retryResponse.ok) {
          const retryText = await retryResponse.text();
          if (retryText) {
            const retryData = JSON.parse(retryText);
            const retryContent = retryData.choices?.[0]?.message?.content || '';
            if (retryContent) {
              log('Retry with json_object mode succeeded');
              text = retryContent.trim();
              if (text.startsWith('```json')) text = text.slice(7);
              else if (text.startsWith('```')) text = text.slice(3);
              if (text.endsWith('```')) text = text.slice(0, -3);
              text = text.trim();
              
              return {
                text: text || '',
                usage: retryData.usage ? {
                  totalTokenCount: retryData.usage.total_tokens,
                  promptTokenCount: retryData.usage.prompt_tokens,
                  candidatesTokenCount: retryData.usage.completion_tokens,
                } : undefined,
              };
            }
          }
        }
      } catch (retryError) {
        warn(`Retry with json_object mode also failed: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
      }
    }

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

  /**
   * Get information about the current model
   */
  async getCurrentModelInfo(): Promise<OpenAICompatibleModelInfo | undefined> {
    return getModelInfo(this.model, this.apiKey, this.baseUrl);
  }

  /**
   * Get all available models
   */
  async getAllModels(): Promise<OpenAICompatibleModelInfo[]> {
    const models = await fetchModelsIfNeeded(this.apiKey, this.baseUrl);
    return Array.from(models.values());
  }
}

/**
 * Clear the models cache (call when settings change)
 */
export function clearOpenAICompatibleModelsCache(): void {
  modelsCache = null;
  console.log('[OpenAICompatible] Models cache cleared');
}

/**
 * Initial fetch of models when server starts
 * Retries up to 3 times
 */
export async function initOpenAICompatibleModels(apiKey: string, baseUrl?: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      console.log(`[OpenAICompatible] Initializing models (attempt ${i + 1}/${retries})...`);
      await fetchModelsIfNeeded(apiKey, baseUrl);
      if (modelsCache && modelsCache.models.size > 0) {
        console.log(`[OpenAICompatible] Initialization successful, cached ${modelsCache.models.size} models`);
        return;
      }
    } catch (error) {
      console.warn(`[OpenAICompatible] Initialization attempt ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
    }
    
    if (i < retries - 1) {
      // Exponential backoff or simple delay
      const delay = Math.pow(2, i) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.error('[OpenAICompatible] Failed to initialize models after all retries');
}

/**
 * Get all available OpenAICompatible models (requires API key)
 */
export async function getOpenAICompatibleModels(apiKey: string, baseUrl?: string): Promise<OpenAICompatibleModelInfo[]> {
  const models = await fetchModelsIfNeeded(apiKey, baseUrl);
  return Array.from(models.values());
}

/**
 * Get info for a specific OpenAICompatible model
 */
export async function getOpenAICompatibleModelInfo(modelId: string, apiKey: string, baseUrl?: string): Promise<OpenAICompatibleModelInfo | undefined> {
  return getModelInfo(modelId, apiKey, baseUrl);
}
