/**
 * Azure LLM Client
 * 
 * Handles Microsoft Azure OpenAI API communication with rate limiting,
 * cost tracking, and error handling
 */

import axios, { AxiosError } from 'axios';

export interface AzureLLMConfig {
  apiKey: string;
  endpoint: string;
  deploymentName: string;
  apiVersion?: string;
  temperature?: number;
  maxTokens?: number;
  requestsPerMinute?: number;
  tokensPerMinute?: number;
  requestsPerDay?: number;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost: number;
  latency: number;
  model: string;
}

export interface UsageStats {
  daily: {
    requests: number;
    tokens: number;
    cost: number;
  };
  recent: {
    requestsLastMinute: number;
    avgLatency: number;
  };
  limits: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay: number;
  };
  model: string;
}

interface RequestHistory {
  timestamp: number;
  tokens: number;
  latency: number;
}

export class AzureLLMClient {
  private apiKey: string;
  private endpoint: string;
  private apiVersion: string;
  public readonly deploymentName: string;
  
  private rateLimit: {
    requestsPerMinute: number;
    tokensPerMinute: number;
    requestsPerDay: number;
  };
  
  private costPer1KTokens: Record<string, { input: number; output: number }> = {
    'gpt-4': { input: 0.03, output: 0.06 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-35-turbo': { input: 0.0015, output: 0.002 },
    'gpt-35-turbo-16k': { input: 0.003, output: 0.004 }
  };
  
  private requestHistory: RequestHistory[] = [];
  private dailyRequestCount: number = 0;
  private dailyTokenCount: number = 0;
  private totalCost: number = 0;
  private lastResetDate: string = new Date().toDateString();
  
  private modelConfig: {
    temperature: number;
    maxTokens: number;
    topP: number;
    frequencyPenalty: number;
    presencePenalty: number;
  };
  
  private maxRetries: number;
  private retryDelay: number;
  private timeout: number;
  
  constructor(config: AzureLLMConfig) {
    // Validate required configuration
    if (!config.apiKey || config.apiKey.trim().length === 0) {
      throw new Error('Azure OpenAI API key is required. Set AZURE_OPENAI_API_KEY environment variable.');
    }
    if (!config.endpoint || config.endpoint.trim().length === 0) {
      throw new Error('Azure OpenAI endpoint is required. Set AZURE_OPENAI_ENDPOINT environment variable.');
    }
    if (!config.deploymentName || config.deploymentName.trim().length === 0) {
      throw new Error('Azure OpenAI deployment name is required. Set AZURE_OPENAI_DEPLOYMENT_NAME environment variable.');
    }
    
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint;
    this.apiVersion = config.apiVersion || '2024-02-15-preview';
    this.deploymentName = config.deploymentName;
    
    this.rateLimit = {
      requestsPerMinute: config.requestsPerMinute || 60,
      tokensPerMinute: config.tokensPerMinute || 60000,
      requestsPerDay: config.requestsPerDay || 10000
    };
    
    this.modelConfig = {
      temperature: config.temperature || 0.7,
      maxTokens: config.maxTokens || 500,
      topP: 0.95,
      frequencyPenalty: 0.0,
      presencePenalty: 0.0
    };
    
    this.maxRetries = config.retries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.timeout = config.timeout || 30000;
    
    // Reset daily counts periodically
    this.resetDailyCounts();
    setInterval(() => this.resetDailyCounts(), 24 * 60 * 60 * 1000);
  }
  
  private resetDailyCounts(): void {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyRequestCount = 0;
      this.dailyTokenCount = 0;
      this.lastResetDate = today;
    }
  }
  
  canMakeRequest(estimatedTokens: number = 100): { allowed: boolean; reason?: string } {
    this.resetDailyCounts();
    
    if (this.dailyRequestCount >= this.rateLimit.requestsPerDay) {
      return { allowed: false, reason: 'Daily request limit exceeded' };
    }
    
    if (this.dailyTokenCount + estimatedTokens > this.rateLimit.tokensPerMinute * 60 * 24) {
      return { allowed: false, reason: 'Daily token limit exceeded' };
    }
    
    const recentRequests = this.requestHistory.filter(
      req => Date.now() - req.timestamp < 60000
    );
    
    if (recentRequests.length >= this.rateLimit.requestsPerMinute) {
      return { allowed: false, reason: 'Rate limit: too many requests per minute' };
    }
    
    return { allowed: true };
  }
  
  private estimateCost(inputTokens: number, outputTokens: number): number {
    const modelName = this.deploymentName.toLowerCase();
    const costs = this.costPer1KTokens[modelName] || this.costPer1KTokens['gpt-35-turbo'];
    
    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;
    
    return inputCost + outputCost;
  }
  
  async makeRequest(
    messages: Array<{ role: string; content: string }>,
    options: Partial<typeof this.modelConfig> = {}
  ): Promise<LLMResponse> {
    const checkResult = this.canMakeRequest();
    if (!checkResult.allowed) {
      throw new Error(`Rate limit exceeded: ${checkResult.reason}`);
    }
    
    // Ensure endpoint doesn't have trailing slash
    const cleanEndpoint = this.endpoint.replace(/\/$/, '');
    const url = `${cleanEndpoint}/openai/deployments/${this.deploymentName}/chat/completions?api-version=${this.apiVersion}`;
    
    // Merge config and options, then convert to API format (snake_case)
    const mergedConfig = {
      ...this.modelConfig,
      ...options
    };
    
    // Convert camelCase to snake_case for Azure OpenAI API
    // Note: Newer models (like gpt-5-mini) have limited parameter support:
    // - Require max_completion_tokens instead of max_tokens
    // - Only support temperature=1 (default), so omit if not 1
    // - Do not support top_p, frequency_penalty, or presence_penalty
    const requestConfig: any = {
      messages,
      max_completion_tokens: mergedConfig.maxTokens  // Use max_completion_tokens for newer models
    };
    
    // Only include temperature if it's 1 (default), otherwise omit it
    // Some models like gpt-5-mini only support the default temperature value
    if (mergedConfig.temperature === 1) {
      requestConfig.temperature = 1;
    }
    // If temperature is not 1, we omit it to use the model's default
    
    // Note: top_p, frequency_penalty, and presence_penalty are not supported by gpt-5-mini
    // so we omit them from the request
    
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const response = await axios.post(
          url,
          requestConfig,
          {
            headers: {
              'api-key': this.apiKey,
              'Content-Type': 'application/json'
            },
            timeout: this.timeout
          }
        );
        
        const endTime = Date.now();
        const latency = endTime - startTime;
        
        // Validate response structure
        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          throw new Error(`Invalid response structure: ${JSON.stringify(response.data)}`);
        }
        
        const choice = response.data.choices[0];
        const content = choice.message?.content || '';
        const finishReason = choice.finish_reason;
        
        // Handle case where response was cut off due to token limit
        if (!content || content.trim().length === 0) {
          if (finishReason === 'length') {
            throw new Error(`Response was truncated due to token limit (max_completion_tokens too low). Consider increasing maxTokens. Finish reason: ${finishReason}`);
          }
          throw new Error(`Invalid response: missing or empty message content. Finish reason: ${finishReason || 'unknown'}. Response: ${JSON.stringify(choice)}`);
        }
        
        const usage = response.data.usage;
        if (!usage) {
          throw new Error(`Invalid response: missing usage information`);
        }
        
        const inputTokens = usage.prompt_tokens || 0;
        const outputTokens = usage.completion_tokens || 0;
        const totalTokens = usage.total_tokens || 0;
        
        this.requestHistory.push({
          timestamp: Date.now(),
          tokens: totalTokens,
          latency
        });
        
        // Keep only last hour of history
        this.requestHistory = this.requestHistory.filter(
          req => Date.now() - req.timestamp < 3600000
        );
        
        this.dailyRequestCount++;
        this.dailyTokenCount += totalTokens;
        
        const cost = this.estimateCost(inputTokens, outputTokens);
        this.totalCost += cost;
        
        return {
          content: content.trim(),
          usage: {
            inputTokens,
            outputTokens,
            totalTokens
          },
          cost,
          latency,
          model: this.deploymentName
        };
        
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        
        if (axiosError.response) {
          const status = axiosError.response.status;
          const errorData = (axiosError.response.data as any)?.error;
          const errorMessage = errorData?.message || JSON.stringify(axiosError.response.data);
          
          if (status === 401 || status === 403) {
            throw new Error(`Authentication error (${status}): ${errorMessage}. Check your AZURE_OPENAI_API_KEY.`);
          }
          if (status === 404) {
            throw new Error(`Azure endpoint not found (404): ${errorMessage}. Check your AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME. URL: ${url}`);
          }
          if (status === 400) {
            throw new Error(`Bad request (400): ${errorMessage}. Check your request format and parameters.`);
          }
          if (status === 429) {
            if (attempt < this.maxRetries - 1) {
              await this.sleep(this.retryDelay * (attempt + 1) * 2);
              continue;
            } else {
              throw new Error(`Rate limit exceeded (429): ${errorMessage}`);
            }
          }
          if (status >= 500) {
            if (attempt < this.maxRetries - 1) {
              await this.sleep(this.retryDelay * (attempt + 1));
              continue;
            } else {
              throw new Error(`Server error (${status}): ${errorMessage}`);
            }
          }
          
          // Other HTTP errors
          throw new Error(`HTTP error (${status}): ${errorMessage}`);
        }
        
        // Network or other errors
        if (axiosError.request) {
          throw new Error(`Network error: No response received. Check your AZURE_OPENAI_ENDPOINT. URL: ${url}`);
        }
        
        // If it's not an axios error, or if we've exhausted retries
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelay * (attempt + 1));
        } else {
          throw error;
        }
      }
    }
    
    throw new Error(`Request failed after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`);
  }
  
  getUsageStats(): UsageStats {
    this.resetDailyCounts();
    
    const recentRequests = this.requestHistory.filter(
      req => Date.now() - req.timestamp < 60000
    );
    
    return {
      daily: {
        requests: this.dailyRequestCount,
        tokens: this.dailyTokenCount,
        cost: this.totalCost
      },
      recent: {
        requestsLastMinute: recentRequests.length,
        avgLatency: recentRequests.length > 0
          ? recentRequests.reduce((sum, r) => sum + r.latency, 0) / recentRequests.length
          : 0
      },
      limits: {
        requestsPerMinute: this.rateLimit.requestsPerMinute,
        tokensPerMinute: this.rateLimit.tokensPerMinute,
        requestsPerDay: this.rateLimit.requestsPerDay
      },
      model: this.deploymentName
    };
  }
  
  resetCostTracking(): void {
    this.totalCost = 0;
    this.dailyRequestCount = 0;
    this.dailyTokenCount = 0;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

