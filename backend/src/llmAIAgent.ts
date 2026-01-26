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
  private lastSpeakingTurnIndex: number = -1; // Track which turn we last spoke on
  
  public role: Role | null = null;
  private team: 'agent' | 'spy' | null = null;
  private visiblePlayers: VisiblePlayer[] = [];
  private gameState: GameState | null = null;
  private chatHistory: Array<{ player: number; content: string }> = [];
  private lastLoggedMessage: string | null = null; // Track last logged message to prevent duplicates
  
  public llmClient: AzureLLMClient;
  private promptEngine: PromptEngine;
  
  private difficulty: string = 'intermediate';
  private responseDelay: number;
  private chatProbability: number;
  private fallbackEnabled: boolean;
  private lastError: Error | null = null;
  private errorCount: number = 0;
  private maxErrors: number;
  private useFallbackOnly: boolean = false;
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
    const previousChatLength = this.chatHistory.length;
    
    // Update chat history from game state (limit to last 5 messages to save tokens)
    const allChatMessages = gameState.chat
      .filter(msg => msg.type === 'player')
      .map(msg => ({
        player: (msg as any).player,
        content: (msg as any).content
      }));
    
    // Only update if chat actually changed (to avoid duplicate logs and processing)
    if (allChatMessages.length !== previousChatLength) {
      // Keep only the last 5 messages to reduce token usage
      this.chatHistory = allChatMessages.slice(-5);
      
      // Log only when a new message arrives and it's different from the last logged message
      if (allChatMessages.length > previousChatLength) {
        const lastMessage = allChatMessages[allChatMessages.length - 1];
        const messageKey = `${lastMessage.player}:${lastMessage.content}`;
        
        // Only log if this is a genuinely new message (different from last logged)
        if (lastMessage.player !== this.playerIndex && messageKey !== this.lastLoggedMessage) {
          this.lastLoggedMessage = messageKey;
          this.logger(`[${this.playerName}] Received chat message from player ${lastMessage.player}: "${lastMessage.content}"`);
        }
      }
    }
    
    this.gameState = gameState;
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
    
    // Handle chat messages (only observe, don't respond reactively in turn-based mode)
    if (action.type === 'game/new-player-chat-message') {
      if (!this.gameState) {
        this.logger(`[${this.playerName}] Received chat message but no game state yet`);
        return;
      }
      
      if (!this.role) {
        this.logger(`[${this.playerName}] Received chat message but role not initialized yet (playerIndex: ${this.playerIndex})`);
        return;
      }
      
      // In turn-based speaking system, AI agents should only speak on their turn
      // (Chat messages are already logged in updateGameState to avoid duplicates)
      // Don't respond reactively to other players' messages
      // They will be triggered by the tick action when it's their turn
      return;
    }
    
    // Handle game state updates from tick
    if (action.type === 'game/tick') {
      // Game state is already updated via routeActionToAgent before handleAction is called
      // Check current phase and act accordingly
      if (!this.gameState) return;
      
      // Handle turn-based speaking system
      if (this.gameState.speakingTurn && this.gameState.speakingTurn.currentSpeaker === this.playerIndex) {
        // It's our turn to speak!
        const currentTurnIndex = this.gameState.speakingTurn.turnIndex;
        const timeRemaining = this.gameState.speakingTurn.timeRemaining;
        
        // Only send if we haven't already sent a message this turn
        if (this.lastSpeakingTurnIndex !== currentTurnIndex) {
          // Set this immediately to prevent multiple calls from queuing up
          this.lastSpeakingTurnIndex = currentTurnIndex;
          
          // Calculate delay to send message near the end of the turn (3 seconds before end to allow for API call time)
          // If timeRemaining is 10, wait 7 seconds. If timeRemaining is 5, wait 2 seconds, etc.
          const delayBeforeSend = Math.max(0, (timeRemaining - 3) * 1000); // Convert seconds to milliseconds
          
          // Start generating in background, but delay sending until near end of turn
          this.generateChatResponseWithDelay(delayBeforeSend).catch(error => {
            // Error already logged in generateChatResponse
            // Reset turn index on error so we can try again if turn hasn't changed
            if (this.gameState?.speakingTurn?.turnIndex === currentTurnIndex) {
              this.lastSpeakingTurnIndex = -1;
            }
          });
        }
        return;
      }
      
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
      
      // Handle voting phase (only during 'voting', not 'voting-review')
      if (this.gameState.game.phase === 'voting') {
        // Ensure team exists before trying to vote
        if (!this.gameState.team) {
          this.logger(`[${this.playerName}] Voting phase but no team available (phase: ${this.gameState.game.phase})`);
          return;
        }
        const ourVote = this.gameState.team.votes[this.playerIndex];
        if (ourVote === 'none' || ourVote === undefined) {
          await this.sleep(this.responseDelay);
          await this.handleTeamVoting();
        }
        return;
      }
      
      // Handle mission phase (only during 'mission', not 'mission-review')
      if (this.gameState.game.phase === 'mission') {
        if (!this.gameState.mission) {
          this.logger(`[${this.playerName}] Mission phase but no mission available (phase: ${this.gameState.game.phase})`);
          return;
        }
        if (this.gameState.mission.members.includes(this.playerIndex)) {
          // Find our index in the members array (actions are indexed by position in members, not player index)
          const memberIndex = this.gameState.mission.members.indexOf(this.playerIndex);
          if (memberIndex >= 0 && memberIndex < this.gameState.mission.actions.length) {
            const ourAction = this.gameState.mission.actions[memberIndex];
            if (ourAction === null) {
              await this.sleep(this.responseDelay);
              await this.handleMissionVote();
            }
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
  
  private async generateChatResponseWithDelay(delayMs: number): Promise<void> {
    // Wait until near the end of the turn before generating and sending
    if (delayMs > 0) {
      await this.sleep(delayMs);
    }
    return this.generateChatResponse();
  }

  /**
   * Process AI chat message: strip quotes and limit to 12 words
   */
  private processChatMessage(message: string): string {
    if (!message) return message;
    
    // Strip leading and trailing quotation marks (single or double)
    let processed = message.trim();
    processed = processed.replace(/^["']+|["']+$/g, '');
    
    // Limit to 12 words
    const words = processed.split(/\s+/).filter(word => word.length > 0);
    if (words.length > 12) {
      processed = words.slice(0, 12).join(' ');
    }
    
    return processed.trim();
  }

  private async generateChatResponse(): Promise<void> {
    if (!this.gameState || !this.role) {
      this.logger(`[${this.playerName}] Cannot generate chat: gameState=${!!this.gameState}, role=${this.role}`);
      return;
    }
    
    // Double-check it's still our turn before generating (game state may have changed)
    if (this.gameState.speakingTurn) {
      if (this.gameState.speakingTurn.currentSpeaker !== this.playerIndex) {
        this.logger(`[${this.playerName}] Not our turn anymore (current speaker: ${this.gameState.speakingTurn.currentSpeaker}), skipping chat generation`);
        return;
      }
    }
    
    // Check if we should use fallback only
    if (this.useFallbackOnly) {
      this.logger(`[${this.playerName}] Using fallback only mode, skipping API request`);
      const fallbackMessage = this.processChatMessage(this.getFallbackChatResponse());
      const chatAction = GameAction.newPlayerChatMessage({
        player: this.playerIndex,
        message: fallbackMessage
      });
      this.socket.emit('action', chatAction);
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
      
      // Log the actual prompt content for debugging
      const promptContent = messages.map(m => `${m.role}: ${m.content}`).join(' | ');
      this.logger(`[${this.playerName}] Sending ${messages.length} messages to Azure OpenAI API. Content: "${promptContent}"`);
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 200,  // Increased for strategic reasoning and team suggestions
        temperature: 0.8
      });
      
      let chatMessage = response.content.trim();
      
      // Handle empty responses
      if (!chatMessage || chatMessage.length === 0) {
        // Check if input was actually too long (more than 100 tokens suggests input issue)
        const inputTokens = response.usage?.inputTokens || 0;
        if (response.finishReason === 'length' && inputTokens > 100) {
          // Input was too long - use fallback immediately
          this.logger(`[${this.playerName}] Input prompt too long (${inputTokens} tokens), using fallback`);
          throw new Error('Input prompt consumed entire context window - using fallback');
        }
        // Otherwise, empty response might be due to model confusion or output truncation
        // Try with a more explicit prompt or use fallback
        this.logger(`[${this.playerName}] Received empty response (finishReason: ${response.finishReason}, inputTokens: ${inputTokens}), using fallback`);
        throw new Error('Received empty response from API');
      }
      
      // Process the message: strip quotes and limit to 12 words
      chatMessage = this.processChatMessage(chatMessage);
      
      this.logger(`[${this.playerName}] Generated chat message: "${chatMessage}"`);
      
      if (this.logModelUsage) {
        this.logUsage('chat', response);
      }
      
      // Reset error count on successful request
      this.errorCount = 0;
      
      // Double-check it's still our turn before sending (game state may have changed during API call)
      if (this.gameState.speakingTurn) {
        if (this.gameState.speakingTurn.currentSpeaker !== this.playerIndex) {
          this.logger(`[${this.playerName}] Not our turn anymore (current speaker: ${this.gameState.speakingTurn.currentSpeaker}), not sending chat message`);
          return;
        }
      }
      
      // Send chat message via Redux action
      const chatAction = GameAction.newPlayerChatMessage({
        player: this.playerIndex,
        message: chatMessage
      });
      
      this.logger(`[${this.playerName}] Emitting chat action:`, chatAction);
      this.socket.emit('action', chatAction);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger(`[${this.playerName}] Error generating chat response: ${errorMessage}`);
      if (error instanceof Error) {
        this.logger(`[${this.playerName}] Error stack:`, error.stack);
      }
      this.handleError('chat', error as Error);
      const fallbackMessage = this.processChatMessage(this.getFallbackChatResponse());
      const chatAction = GameAction.newPlayerChatMessage({
        player: this.playerIndex,
        message: fallbackMessage
      });
      this.socket.emit('action', chatAction);
    }
  }
  
  private async handleTeamBuilding(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    if (this.useFallbackOnly) {
      const fallbackTeam = this.getFallbackTeamProposal(
        this.gameState.game.mission === 1 ? 2 : 3
      );
      const teamAction = GameAction.updateTeamMembers({
        members: fallbackTeam
      });
      this.socket.emit('action', teamAction);
      
      const proposeAction = GameAction.finishTeamBuilding();
      this.socket.emit('action', proposeAction);
      return;
    }
    
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
        maxTokens: 100,  // Increased for team proposals
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
        
        // First update team members
        const teamAction = GameAction.updateTeamMembers({
          members: teamIndices
        });
        this.socket.emit('action', teamAction);
        
        // Then finish team building (propose the team)
        const proposeAction = GameAction.finishTeamBuilding();
        this.socket.emit('action', proposeAction);
      } else {
        const fallbackTeam = this.getFallbackTeamProposal(requiredSize);
        const teamAction = GameAction.updateTeamMembers({
          members: fallbackTeam
        });
        this.socket.emit('action', teamAction);
        
        // Then finish team building (propose the team)
        const proposeAction = GameAction.finishTeamBuilding();
        this.socket.emit('action', proposeAction);
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
      
      // Then finish team building (propose the team)
      const proposeAction = GameAction.finishTeamBuilding();
      this.socket.emit('action', proposeAction);
    }
  }
  
  private async handleTeamVoting(): Promise<void> {
    if (!this.gameState || !this.role) return;
    
    // Double-check that team exists and we're in voting phase
    if (!this.gameState.team) {
      this.logger(`[${this.playerName}] Cannot vote: no team available (phase: ${this.gameState.game.phase})`);
      return;
    }
    
    if (this.gameState.game.phase !== 'voting') {
      this.logger(`[${this.playerName}] Cannot vote: not in voting phase (current phase: ${this.gameState.game.phase})`);
      return;
    }
    
    try {
      const messages = this.promptEngine.generateTeamVotePrompt(
        this.gameState,
        this.role,
        this.playerIndex,
        this.visiblePlayers,
        this.chatHistory
      );
      
      const response = await this.llmClient.makeRequest(messages, {
        maxTokens: 50,  // Increased for voting (need "APPROVE" or "REJECT")
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
    
    // Double-check that mission exists and we're in mission phase
    if (!this.gameState.mission) {
      this.logger(`[${this.playerName}] Cannot vote on mission: no mission available (phase: ${this.gameState.game.phase})`);
      return;
    }
    
    if (this.gameState.game.phase !== 'mission') {
      this.logger(`[${this.playerName}] Cannot vote on mission: not in mission phase (current phase: ${this.gameState.game.phase})`);
      return;
    }
    
    // Verify we're actually on the mission team
    if (!this.gameState.mission.members.includes(this.playerIndex)) {
      this.logger(`[${this.playerName}] Cannot vote on mission: not on mission team`);
      return;
    }
    
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
        maxTokens: 50,  // Increased for voting (need "APPROVE" or "REJECT")
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
          return role === 'merlin' || role === 'agent' || role === 'loyal_servant' || role === 'percival' || role === 'deputy';
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
      
      const finishAction = GameAction.finishAssassinChoice();
      this.socket.emit('action', finishAction);
      
    } catch (error) {
      this.handleError('assassinate', error as Error);
      const fallbackTarget = this.getFallbackAssassinationTarget();
      const assassinAction = GameAction.updateAssassinChoice({
        player: fallbackTarget
      });
      this.socket.emit('action', assassinAction);
      
      const finishAction = GameAction.finishAssassinChoice();
      this.socket.emit('action', finishAction);
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
      this.useFallbackOnly = true;
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
      .filter(({ role }) => role === 'merlin' || role === 'agent' || role === 'loyal_servant' || role === 'percival' || role === 'deputy');
    
    if (goodPlayers.length === 0) return 0;
    return goodPlayers[Math.floor(Math.random() * goodPlayers.length)].index;
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

