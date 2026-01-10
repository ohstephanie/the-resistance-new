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
    
    const requestConfig = {
      ...this.modelConfig,
      ...options,
      messages
    };
    
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
        
        const usage = response.data.usage;
        const inputTokens = usage.prompt_tokens;
        const outputTokens = usage.completion_tokens;
        const totalTokens = usage.total_tokens;
        
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
          content: response.data.choices[0].message.content,
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
          if (status === 401 || status === 403) {
            throw new Error(`Authentication error: ${(axiosError.response.data as any)?.error?.message || 'Invalid API key'}`);
          }
          if (status === 404) {
            const errorMsg = (axiosError.response.data as any)?.error?.message || 'Not found';
            throw new Error(`Azure endpoint not found (404): ${errorMsg}. Check your AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_DEPLOYMENT_NAME. URL: ${url}`);
          }
          if (status === 429) {
            await this.sleep(this.retryDelay * (attempt + 1) * 2);
            continue;
          }
          if (status >= 500) {
            await this.sleep(this.retryDelay * (attempt + 1));
            continue;
          }
        }
        
        if (attempt < this.maxRetries - 1) {
          await this.sleep(this.retryDelay * (attempt + 1));
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

