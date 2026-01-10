/**
 * LLM AI Agent
 * 
 * AI player powered by Microsoft Azure LLM APIs
 * Handles game events via Socket.io and makes LLM-driven decisions
 */

import { AnyAction } from "@reduxjs/toolkit";
import { GameAction, GameState, Role, ProposalVote, MissionAction } from "common-modules";
import { Socket } from "socket.io";
import { AzureLLMClient, AzureLLMConfig, LLMResponse } from "./azureLLMClient";
import { PromptEngine, VisiblePlayer } from "./promptEngine";
import { actionFromServer } from "./util";

export interface LLMAIAgentConfig extends AzureLLMConfig {
  playerIndex: number;
  playerName: string;
  socketId: string;
  socket: Socket;
  responseDelay?: number;
  chatProbability?: number;
  fallbackEnabled?: boolean;
  maxErrors?: number;
  logger?: (message: string, ...args: any[]) => void;
  logModelUsage?: boolean;
}

export interface UsageLogEntry {
  timestamp: string;
  playerIndex: number;
  playerName: string;
  role: Role;
  action: string;
  model: string;
  tokens: number;
  cost: number;
  latency: number;
}

export class LLMAIAgent {
  public playerIndex: number;
  public playerName: string;
  private socketId: string;
  private socket: Socket;
  
  public role: Role | null = null;
  private team: 'agent' | 'spy' | null = null;
  private visiblePlayers: VisiblePlayer[] = [];
  private gameState: GameState | null = null;
  private chatHistory: Array<{ player: number; content: string }> = [];
  
  public llmClient: AzureLLMClient;
  private promptEngine: PromptEngine;
  
  private difficulty: string = 'intermediate';
  private responseDelay: number;
  private chatProbability: number;
  private fallbackEnabled: boolean;
  private lastError: Error | null = null;
  private errorCount: number = 0;
  private maxErrors: number;
  private logger: (message: string, ...args: any[]) => void;
  private logModelUsage: boolean;
  
  private usageLog: UsageLogEntry[] = [];
  
  constructor(config: LLMAIAgentConfig) {
    this.playerIndex = config.playerIndex;
    this.playerName = config.playerName;
    this.socketId = config.socketId;
    this.socket = config.socket;
    
    this.llmClient = new AzureLLMClient(config);
    this.promptEngine = new PromptEngine();
    
    this.responseDelay = config.responseDelay || 2000;
    this.chatProbability = config.chatProbability || 0.5; // Increased default probability
    this.fallbackEnabled = config.fallbackEnabled !== false;
    this.maxErrors = config.maxErrors || 5;
    this.logger = config.logger || console.log;
    this.logModelUsage = config.logModelUsage !== false;
    
    this.logger(`LLM AI Agent ${this.playerName} initialized using model ${this.llmClient.deploymentName}`);
  }
  
  initialize(role: Role, team: 'agent' | 'spy', visiblePlayers: VisiblePlayer[] = []): void {
    this.role = role;
    this.team = team;
    this.visiblePlayers = visiblePlayers;
    
    this.logger(`LLM AI Agent ${this.playerName} initialized as ${role} (${team} team) using model ${this.llmClient.deploymentName}`);
  }
  
  updateGameState(gameState: GameState): void {
    this.gameState = gameState;
    
    // Update chat history from game state
    this.chatHistory = gameState.chat
      .filter(msg => msg.type === 'player')
      .map(msg => ({
        player: (msg as any).player,
        content: (msg as any).content
      }));
    
    // Debug: log when we receive chat messages
    if (gameState.chat.length > 0) {
      const lastMessage = gameState.chat[gameState.chat.length - 1];
      if (lastMessage.type === 'player' && (lastMessage as any).player !== this.playerIndex) {
        this.logger(`[${this.playerName}] Received chat message from player ${(lastMessage as any).player}: "${(lastMessage as any).content}"`);
      }
    }
  }
  
  async handleAction(action: AnyAction): Promise<void> {
    if (!this.gameState && action.type !== 'game/hydrate') {
      // Wait for game state to be hydrated
      return;
    }
    
    // Handle game state updates
    if (action.type === 'game/hydrate') {
      this.updateGameState(action.payload as GameState);
      this.logger(`[${this.playerName}] Received game/hydrate action`);
      return;
    }
    
    // Handle role assignment (when game initializes)
    if (action.type === 'game/initialize') {
      // Role will be set when we receive the hydrated state
      this.logger(`[${this.playerName}] Received game/initialize action`);
      return;
    }
    
    // Handle chat messages
    if (action.type === 'game/new-player-chat-message') {
      if (!this.gameState) {
        this.logger(`[${this.playerName}] Received chat message but no game state yet`);
        return;
      }
      
      if (!this.role) {
        this.logger(`[${this.playerName}] Received chat message but role not initialized yet (playerIndex: ${this.playerIndex})`);
        return;
      }
      
      const payload = (action as any).payload;
      this.logger(`[${this.playerName}] Received chat message from player ${payload.player}: "${payload.message}"`);
      
      // Chat history is already updated via updateGameState in routeActionToAgent
      
      if (payload.player !== this.playerIndex) {
        // Increase probability of responding to direct mentions
        const message = (payload.message || '').toLowerCase();
        const mentionsName = this.playerName && message.includes(this.playerName.toLowerCase());
        const responseProb = mentionsName ? 0.9 : this.chatProbability;
        
        // Decide if we should respond
        const shouldRespond = Math.random() < responseProb;
        
        if (shouldRespond) {
          await this.sleep(this.responseDelay + Math.random() * 1000);
          await this.generateChatResponse();
        }
      } else {
        this.logger(`[${this.playerName}] Ignoring own chat message`);
      }
      return;
    }
    
    // Handle game state updates from tick
    if (action.type === 'game/tick') {
      // Game state is already updated via routeActionToAgent before handleAction is called
      // Check current phase and act accordingly
      if (!this.gameState) return;
      
      // Handle team building phase
      if (this.gameState.game.phase === 'team-building') {
        const currentLeader = this.gameState.team?.leader;
        if (currentLeader === this.playerIndex) {
          // Check if team is already proposed
          if (!this.gameState.team || this.gameState.team.members.length === 0) {
            await this.sleep(this.responseDelay);
            await this.handleTeamBuilding();
          }
        }
        return;
      }
      
      // Handle voting phase
      if (this.gameState.game.phase === 'voting') {
        const ourVote = this.gameState.team?.votes[this.playerIndex];
        if (ourVote === 'none' || ourVote === undefined) {
          await this.sleep(this.responseDelay);
          await this.handleTeamVoting();
        }
        return;
      }
      
      // Handle mission phase
      if (this.gameState.game.phase === 'mission') {
        if (this.gameState.mission && this.gameState.mission.members.includes(this.playerIndex)) {
          const ourAction = this.gameState.mission.actions[this.playerIndex];
          if (ourAction === null) {
            await this.sleep(this.responseDelay);
            await this.handleMissionVote();
          }
        }
        return;
      }
      
      // Handle assassination phase
      if (this.gameState.game.phase === 'finished-assassinate') {
        if (this.role === 'assassin' && this.gameState.assassinChoice === null) {
          await this.sleep(this.responseDelay * 2);
          await this.handleAssassination();
        }
        return;
      }
      
      return;
    }
    
  }
  
  private async generateChatResponse(): Promise<void> {
    if (!this.gameState || !this.role) {
      this.logger(`[${this.playerName}] Cannot generate chat: gameState=${!!this.gameState}, role=${this.role}`);
      return;
    }
    
    try {
      this.logger(`[${this.playerName}] Generating chat response...`);
      
      const messages = this.promptEngine.generateChatPrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory,
        this.playerName
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 100,
        temperature: 0.8
      });
      
      const chatMessage = response.content.trim();
      this.logger(`[${this.playerName}] Generated chat message: "${chatMessage}"`);
      
      if (this.logModelUsage) {
        this.logUsage('chat', response);
      }
      
      // Send chat message via Redux action
      const chatAction = GameAction.newPlayerChatMessage({
        player: this.playerIndex,
        message: chatMessage
      });
      
      this.logger(`[${this.playerName}] Emitting chat action:`, chatAction);
      this.socket.emit('action', chatAction);
      
    } catch (error) {
      this.logger(`[${this.playerName}] Error generating chat response:`, error);
      this.handleError('chat', error as Error);
      const fallbackMessage = this.getFallbackChatResponse();
      const chatAction = GameAction.newPlayerChatMessage({
        player: this.playerIndex,
        message: fallbackMessage
      });
      this.socket.emit('action', chatAction);
    }
  }
  
  private async handleTeamBuilding(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    try {
      // Get required team size for current mission
      const missionNumber = this.gameState.game.mission;
      const missionSizes: Record<number, number> = {
        1: 2, 2: 3, 3: 3, 4: 4, 5: 4
      };
      const requiredSize = missionSizes[missionNumber] || 2;
      
      const messages = this.promptEngine.generateTeamProposalPrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory,
        requiredSize
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 50,
        temperature: 0.5
      });
      
      // Parse JSON array from response
      let teamIndices: number[] = [];
      try {
        const jsonMatch = response.content.match(/\[[\d\s,]+\]/);
        if (jsonMatch) {
          teamIndices = JSON.parse(jsonMatch[0]);
        } else {
          const numbers = response.content.match(/\d+/g);
          if (numbers && numbers.length >= requiredSize) {
            teamIndices = numbers.slice(0, requiredSize).map(n => parseInt(n));
          }
        }
      } catch (parseError) {
        this.logger(`Failed to parse team proposal: ${response.content}`);
        teamIndices = this.getFallbackTeamProposal(requiredSize);
      }
      
      // Validate and send
      if (teamIndices.length === requiredSize && teamIndices.every(i => i >= 0 && i < this.gameState!.player.names.length)) {
        if (this.logModelUsage) {
          this.logUsage('propose_team', response);
        }
        
        const teamAction = GameAction.updateTeamMembers({
          members: teamIndices
        });
        this.socket.emit('action', teamAction);
      } else {
        const fallbackTeam = this.getFallbackTeamProposal(requiredSize);
        const teamAction = GameAction.updateTeamMembers({
          members: fallbackTeam
        });
        this.socket.emit('action', teamAction);
      }
      
    } catch (error) {
      this.handleError('propose_team', error as Error);
      const fallbackTeam = this.getFallbackTeamProposal(
        this.gameState.game.mission === 1 ? 2 : 3
      );
      const teamAction = GameAction.updateTeamMembers({
        members: fallbackTeam
      });
      this.socket.emit('action', teamAction);
    }
  }
  
  private async handleTeamVoting(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    try {
      const messages = this.promptEngine.generateTeamVotePrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 10,
        temperature: 0.3
      });
      
      const voteText = response.content.trim().toUpperCase();
      const vote: ProposalVote = voteText.includes('APPROVE') || voteText.includes('YES') ? 'accept' : 'reject';
      
      if (this.logModelUsage) {
        this.logUsage('vote_team', response);
      }
      
      const voteAction = GameAction.sendProposalVote({
        player: this.playerIndex,
        vote
      });
      this.socket.emit('action', voteAction);
      
    } catch (error) {
      this.handleError('vote_team', error as Error);
      const fallbackVote = this.getFallbackTeamVote();
      const voteAction = GameAction.sendProposalVote({
        player: this.playerIndex,
        vote: fallbackVote
      });
      this.socket.emit('action', voteAction);
    }
  }
  
  private async handleMissionVote(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    try {
      const canFail = this.team === 'spy';
      
      const messages = this.promptEngine.generateMissionVotePrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory,
        canFail
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 10,
        temperature: 0.3
      });
      
      const voteText = response.content.trim().toUpperCase();
      let action: MissionAction = 'success';
      
      if (canFail) {
        action = voteText.includes('FAIL') ? 'fail' : 'success';
      }
      
      if (this.logModelUsage) {
        this.logUsage('vote_mission', response);
      }
      
      const missionAction = GameAction.sendMissionAction({
        player: this.playerIndex,
        action
      });
      this.socket.emit('action', missionAction);
      
    } catch (error) {
      this.handleError('vote_mission', error as Error);
      const fallbackAction = this.getFallbackMissionVote(this.team === 'spy');
      const missionAction = GameAction.sendMissionAction({
        player: this.playerIndex,
        action: fallbackAction
      });
      this.socket.emit('action', missionAction);
    }
  }
  
  private async handleAssassination(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    try {
      // Get good players as targets
      const targets = this.gameState.player.names
        .map((name, index) => ({ index, name }))
        .filter((_, index) => {
          const role = this.gameState!.player.roles[index];
          return role === 'merlin' || role === 'captain' || role === 'agent' || role === 'loyal_servant' || role === 'percival' || role === 'deputy';
        });
      
      const messages = this.promptEngine.generateAssassinationPrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory,
        targets
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 10,
        temperature: 0.2
      });
      
      const targetMatch = response.content.match(/\d+/);
      let targetIndex = targetMatch ? parseInt(targetMatch[0]) : 0;
      
      if (targetIndex < 0 || targetIndex >= targets.length) {
        targetIndex = 0;
      }
      
      const targetPlayerIndex = targets[targetIndex].index;
      
      if (this.logModelUsage) {
        this.logUsage('assassinate', response);
      }
      
      const assassinAction = GameAction.updateAssassinChoice({
        player: targetPlayerIndex
      });
      this.socket.emit('action', assassinAction);
      
    } catch (error) {
      this.handleError('assassinate', error as Error);
      const fallbackTarget = this.getFallbackAssassinationTarget();
      const assassinAction = GameAction.updateAssassinChoice({
        player: fallbackTarget
      });
      this.socket.emit('action', assassinAction);
    }
  }
  
  private logUsage(actionType: string, response: LLMResponse): void {
    const logEntry: UsageLogEntry = {
      timestamp: new Date().toISOString(),
      playerIndex: this.playerIndex,
      playerName: this.playerName,
      role: this.role!,
      action: actionType,
      model: response.model,
      tokens: response.usage.totalTokens,
      cost: response.cost,
      latency: response.latency
    };
    
    this.usageLog.push(logEntry);
    
    if (this.usageLog.length > 1000) {
      this.usageLog = this.usageLog.slice(-1000);
    }
    
    this.logger(`[LLM Usage] ${this.playerName} (${this.role}) - ${actionType}: ${response.usage.totalTokens} tokens, $${response.cost.toFixed(4)}, ${response.latency}ms`);
  }
  
  getUsageStats() {
    const clientStats = this.llmClient.getUsageStats();
    const playerStats = {
      playerIndex: this.playerIndex,
      playerName: this.playerName,
      role: this.role,
      model: this.llmClient.deploymentName,
      totalActions: this.usageLog.length,
      totalCost: this.usageLog.reduce((sum, log) => sum + log.cost, 0),
      totalTokens: this.usageLog.reduce((sum, log) => sum + log.tokens, 0),
      actionsByType: {} as Record<string, number>
    };
    
    this.usageLog.forEach(log => {
      playerStats.actionsByType[log.action] = (playerStats.actionsByType[log.action] || 0) + 1;
    });
    
    return {
      client: clientStats,
      player: playerStats,
      usageLog: this.usageLog.slice(-100)
    };
  }
  
  private handleError(actionType: string, error: Error): void {
    this.lastError = error;
    this.errorCount++;
    this.logger(`[LLM AI Error] ${this.playerName} - ${actionType}: ${error.message}`);
    
    if (this.errorCount >= this.maxErrors) {
      this.logger(`[LLM AI] ${this.playerName} has exceeded max errors, using fallback only`);
    }
  }
  
  private getFallbackChatResponse(): string {
    const responses = {
      agent: [
        "I trust this team will succeed.",
        "Let us proceed with caution.",
        "The mission must not fail.",
        "I have faith in our cause."
      ],
      spy: [
        "This seems like a good plan.",
        "I agree with the proposal.",
        "Let's move forward.",
        "Sounds reasonable to me."
      ]
    };
    
    const teamResponses = responses[this.team || 'agent'];
    return teamResponses[Math.floor(Math.random() * teamResponses.length)];
  }
  
  private getFallbackTeamProposal(requiredSize: number): number[] {
    if (!this.gameState) return [];
    const available = this.gameState.player.names.map((_, i) => i);
    return available.slice(0, requiredSize);
  }
  
  private getFallbackTeamVote(): ProposalVote {
    if (this.team === 'agent') {
      return Math.random() > 0.3 ? 'accept' : 'reject';
    } else {
      return Math.random() > 0.5 ? 'accept' : 'reject';
    }
  }
  
  private getFallbackMissionVote(canFail: boolean): MissionAction {
    if (!canFail) return 'success';
    return Math.random() > 0.6 ? 'fail' : 'success';
  }
  
  private getFallbackAssassinationTarget(): number {
    if (!this.gameState) return 0;
    const goodPlayers = this.gameState.player.roles
      .map((role, index) => ({ role, index }))
      .filter(({ role }) => role === 'merlin' || role === 'captain' || role === 'agent' || role === 'loyal_servant' || role === 'percival' || role === 'deputy');
    
    if (goodPlayers.length === 0) return 0;
    return goodPlayers[Math.floor(Math.random() * goodPlayers.length)].index;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

