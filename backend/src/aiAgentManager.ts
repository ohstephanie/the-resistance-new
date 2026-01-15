/**
 * AI Agent Manager
 * 
 * Manages multiple LLM-powered AI agents with different model configurations
 * Handles Socket.io event routing to AI agents
 */

import { Socket } from "socket.io";
import { AnyAction } from "@reduxjs/toolkit";
import { GameState, Role } from "common-modules";
import { LLMAIAgent, LLMAIAgentConfig, UsageLogEntry } from "./llmAIAgent";
import { AzureLLMConfig } from "./azureLLMClient";

export interface AgentConfig extends AzureLLMConfig {
  weight?: number;
  difficulty?: string;
  responseDelay?: number;
  chatProbability?: number;
}

export type ModelDistribution = 'round-robin' | 'random' | 'weighted';

export class AIAgentManager {
  public agents: Map<string, LLMAIAgent> = new Map(); // socketId -> LLMAIAgent
  private agentConfigs: AgentConfig[] = [];
  private modelDistribution: ModelDistribution;
  private currentModelIndex: number = 0;
  private logger: (message: string, ...args: any[]) => void;
  private io: any;
  private globalUsageLog: UsageLogEntry[] = [];
  private maxGlobalLogSize: number = 10000;
  
  constructor(config: {
    io: any;
    logger?: (message: string, ...args: any[]) => void;
    agentConfigs: AgentConfig[];
    modelDistribution?: ModelDistribution;
  }) {
    this.io = config.io;
    this.logger = config.logger || console.log;
    this.agentConfigs = config.agentConfigs;
    this.modelDistribution = config.modelDistribution || 'round-robin';
  }
  
  createAgent(modelConfig: AgentConfig, socketId: string, playerIndex: number, playerName: string, socket: Socket): LLMAIAgent {
    const agent = new LLMAIAgent({
      ...modelConfig,
      playerIndex,
      playerName,
      socketId,
      socket,
      logger: this.logger
    });
    
    this.agents.set(socketId, agent);
    this.logger(`Created AI agent ${playerName} with model ${modelConfig.deploymentName}`);
    
    return agent;
  }
  
  createAgentWithModel(socketId: string, playerIndex: number, playerName: string, socket: Socket): LLMAIAgent {
    if (this.agentConfigs.length === 0) {
      throw new Error('No agent configurations available');
    }
    
    let modelConfig: AgentConfig;
    
    switch (this.modelDistribution) {
      case 'round-robin':
        modelConfig = this.agentConfigs[this.currentModelIndex];
        this.currentModelIndex = (this.currentModelIndex + 1) % this.agentConfigs.length;
        break;
        
      case 'random':
        modelConfig = this.agentConfigs[Math.floor(Math.random() * this.agentConfigs.length)];
        break;
        
      case 'weighted':
        const totalWeight = this.agentConfigs.reduce((sum, config) => sum + (config.weight || 1), 0);
        let random = Math.random() * totalWeight;
        for (const config of this.agentConfigs) {
          random -= (config.weight || 1);
          if (random <= 0) {
            modelConfig = config;
            break;
          }
        }
        if (!modelConfig!) {
          modelConfig = this.agentConfigs[0];
        }
        break;
        
      default:
        modelConfig = this.agentConfigs[0];
    }
    
    return this.createAgent(modelConfig, socketId, playerIndex, playerName, socket);
  }
  
  async routeActionToAgent(socketId: string, action: AnyAction, gameState?: GameState): Promise<void> {
    const agent = this.agents.get(socketId);
    if (!agent) {
      // Only log if it's not a tick action (to reduce noise)
      if (action.type !== 'game/tick') {
        this.logger(`No agent found for socketId: ${socketId} (action: ${action.type})`);
      }
      return;
    }
    
    try {
      // Update game state if provided
      if (gameState) {
        agent.updateGameState(gameState);
        
        // First, try to find and update playerIndex if it's still -1
        if (agent.playerIndex < 0) {
          const foundIndex = gameState.player.socketIDs.findIndex(sid => sid === socketId);
          if (foundIndex >= 0) {
            agent.playerIndex = foundIndex;
            agent.playerName = gameState.player.names[foundIndex];
            this.logger(`[AIAgentManager] Updated playerIndex for agent ${agent.playerName} to ${foundIndex}`);
          }
        }
        
        // Initialize role if not set and playerIndex is valid
        if (!agent.role && agent.playerIndex >= 0 && gameState.player.roles.length > agent.playerIndex) {
          const role = gameState.player.roles[agent.playerIndex];
          const team = this.getTeamFromRole(role);
          const visiblePlayers = this.getVisiblePlayers(gameState, agent.playerIndex, role);
          agent.initialize(role, team, visiblePlayers);
          this.logger(`[AIAgentManager] Initialized agent ${agent.playerName} with role ${role} (playerIndex: ${agent.playerIndex})`);
        } else if (!agent.role) {
          this.logger(`[AIAgentManager] Cannot initialize agent ${agent.playerName}: playerIndex=${agent.playerIndex}, roles.length=${gameState.player.roles.length}`);
        }
      }
      
      // Log when routing chat messages for debugging
      if (action.type === 'game/new-player-chat-message') {
        this.logger(`[AIAgentManager] Routing chat message to agent ${agent.playerName} (socketId: ${socketId}, playerIndex: ${agent.playerIndex})`);
      }
      
      await agent.handleAction(action);
    } catch (error) {
      this.logger(`Error routing action to agent ${socketId}:`, error);
    }
  }
  
  removeAgent(socketId: string): void {
    const agent = this.agents.get(socketId);
    if (agent) {
      const stats = agent.getUsageStats();
      this.globalUsageLog.push(...stats.usageLog);
      
      if (this.globalUsageLog.length > this.maxGlobalLogSize) {
        this.globalUsageLog = this.globalUsageLog.slice(-this.maxGlobalLogSize);
      }
      
      this.logger(`Removed AI agent ${agent.playerName} (model: ${agent.llmClient.deploymentName})`);
      this.agents.delete(socketId);
    }
  }
  
  getAllUsageStats() {
    const stats = {
      totalAgents: this.agents.size,
      agents: [] as any[],
      global: {
        totalCost: 0,
        totalTokens: 0,
        totalActions: 0,
        models: {} as Record<string, any>
      }
    };
    
    for (const [socketId, agent] of this.agents) {
      const agentStats = agent.getUsageStats();
      stats.agents.push({
        socketId,
        name: agent.playerName,
        role: agent.role,
        model: agent.llmClient.deploymentName,
        stats: agentStats
      });
      
      stats.global.totalCost += agentStats.player.totalCost;
      stats.global.totalTokens += agentStats.player.totalTokens;
      stats.global.totalActions += agentStats.player.totalActions;
      
      const modelName = agent.llmClient.deploymentName;
      if (!stats.global.models[modelName]) {
        stats.global.models[modelName] = {
          agents: 0,
          cost: 0,
          tokens: 0,
          actions: 0
        };
      }
      
      stats.global.models[modelName].agents++;
      stats.global.models[modelName].cost += agentStats.player.totalCost;
      stats.global.models[modelName].tokens += agentStats.player.totalTokens;
      stats.global.models[modelName].actions += agentStats.player.totalActions;
    }
    
    this.globalUsageLog.forEach(log => {
      stats.global.totalCost += log.cost;
      stats.global.totalTokens += log.tokens;
      stats.global.totalActions++;
      
      if (!stats.global.models[log.model]) {
        stats.global.models[log.model] = {
          agents: 0,
          cost: 0,
          tokens: 0,
          actions: 0
        };
      }
      
      stats.global.models[log.model].cost += log.cost;
      stats.global.models[log.model].tokens += log.tokens;
      stats.global.models[log.model].actions++;
    });
    
    return stats;
  }
  
  getModelComparisonReport() {
    const stats = this.getAllUsageStats();
    const report = {
      summary: {
        totalAgents: stats.totalAgents,
        totalCost: stats.global.totalCost,
        totalTokens: stats.global.totalTokens,
        totalActions: stats.global.totalActions
      },
      models: [] as any[]
    };
    
    for (const [modelName, modelStats] of Object.entries(stats.global.models)) {
      report.models.push({
        model: modelName,
        agents: modelStats.agents,
        totalCost: modelStats.cost,
        totalTokens: modelStats.tokens,
        totalActions: modelStats.actions,
        avgCostPerAction: modelStats.actions > 0 ? modelStats.cost / modelStats.actions : 0,
        avgTokensPerAction: modelStats.actions > 0 ? modelStats.tokens / modelStats.actions : 0
      });
    }
    
    report.models.sort((a, b) => b.totalCost - a.totalCost);
    
    return report;
  }
  
  private getTeamFromRole(role: Role): 'agent' | 'spy' {
    const evilRoles: Role[] = ['spy', 'assassin', 'imposter', 'mole', 'intern', 'morgana', 'mordred', 'oberon'];
    return evilRoles.includes(role) ? 'spy' : 'agent';
  }
  
  private getVisiblePlayers(gameState: GameState, playerIndex: number, role: Role): Array<{ playerId: number; name: string; role: string; reason: string }> {
    const visible: Array<{ playerId: number; name: string; role: string; reason: string }> = [];
    
    // This is a simplified version - you'd need to implement full role visibility logic
    // based on the game rules (Merlin sees evil, spies see each other, etc.)
    
    if (role === 'merlin') {
      // Can see evil players
      gameState.player.roles.forEach((r, idx) => {
        if (idx !== playerIndex && (r === 'spy' || r === 'morgana' || r === 'assassin' || r === 'mordred' || r === 'imposter' || r === 'mole')) {
          if (role === 'merlin' && r === 'mordred') return; // Mordred hidden from Merlin
          visible.push({
            playerId: idx,
            name: gameState.player.names[idx],
            role: r,
            reason: 'evil_team'
          });
        }
      });
    } else if (role === 'spy' || role === 'morgana' || role === 'assassin' || role === 'mordred' || role === 'imposter' || role === 'mole') {
      // Spies see each other (except intern/oberon)
      gameState.player.roles.forEach((r, idx) => {
        if (idx !== playerIndex && (r === 'spy' || r === 'morgana' || r === 'assassin' || r === 'mordred' || r === 'imposter' || r === 'mole')) {
          visible.push({
            playerId: idx,
            name: gameState.player.names[idx],
            role: r,
            reason: 'evil_team'
          });
        }
      });
    } else if (role === 'percival') {
      // Sees Merlin/Morgana
      gameState.player.roles.forEach((r, idx) => {
        if (idx !== playerIndex && (r === 'merlin' || r === 'morgana')) {
          visible.push({
            playerId: idx,
            name: gameState.player.names[idx],
            role: r === 'merlin' ? 'merlin' : 'morgana',
            reason: 'special_sight'
          });
        }
      });
    }
    
    return visible;
  }
}

