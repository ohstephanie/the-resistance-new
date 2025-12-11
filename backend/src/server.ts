import { AnyAction } from "@reduxjs/toolkit";
import { LobbyAction, GameAction, GameState } from "common-modules";
import socketIO, { Socket } from "socket.io";
import { Lobby } from "./lobby";
import { QueueManager } from "./queue";
import { actionFromServer, RoomCodeManager } from "./util";
import { AIAgentManager, AgentConfig } from "./aiAgentManager";

export class Server {
  io: socketIO.Server;
  sockets: Map<string, string | null>;
  idManager: RoomCodeManager;
  queueManager: QueueManager;
  aiAgentManager: AIAgentManager | null = null;
  useLLMAgents: boolean = false;
  
  constructor(io: socketIO.Server) {
    this.io = io;
    this.io.on("connection", this.onConnection.bind(this));
    this.sockets = new Map();
    this.idManager = new RoomCodeManager();
    this.queueManager = new QueueManager(io, this.sockets);
    
    // Initialize AI agents if enabled
    this.initializeLLMAgents();
  }
  
  private initializeLLMAgents(): void {
    this.useLLMAgents = process.env.USE_LLM_AGENTS === 'true';
    
    if (!this.useLLMAgents) {
      console.log('LLM AI agents disabled (USE_LLM_AGENTS is not set to "true")');
      return;
    }
    
    console.log('LLM AI agents enabled. Loading configurations...');
    
    try {
      const agentConfigs = this.loadLLMAgentConfigs();
      
      if (agentConfigs.length === 0) {
        console.warn('No LLM agent configurations found. Set USE_LLM_AGENTS=false or configure agents.');
        console.warn('Required environment variables:');
        console.warn('  - AZURE_OPENAI_ENDPOINT');
        console.warn('  - AZURE_OPENAI_API_KEY');
        console.warn('  - AZURE_OPENAI_DEPLOYMENT_NAME (optional, defaults to gpt-35-turbo)');
        this.useLLMAgents = false;
        return;
      }
      
      this.aiAgentManager = new AIAgentManager({
        io: this.io,
        logger: console.log,
        agentConfigs: agentConfigs,
        modelDistribution: (process.env.LLM_MODEL_DISTRIBUTION as any) || 'round-robin'
      });
      
      console.log(`Initialized LLM AI Agent Manager with ${agentConfigs.length} model configurations`);
    } catch (error) {
      console.error('Failed to initialize LLM agents:', error);
      this.useLLMAgents = false;
    }
  }
  
  private loadLLMAgentConfigs(): AgentConfig[] {
    const configs: AgentConfig[] = [];
    
    const modelNames = (process.env.LLM_MODELS || '').split(',').map(s => s.trim()).filter(s => s);
    
    if (modelNames.length === 0) {
      // Default: single model from env vars
      if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY) {
        configs.push({
          apiKey: process.env.AZURE_OPENAI_API_KEY,
          endpoint: process.env.AZURE_OPENAI_ENDPOINT,
          deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-35-turbo',
          apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-02-15-preview',
          temperature: parseFloat(process.env.AZURE_OPENAI_TEMPERATURE || '0.7'),
          maxTokens: parseInt(process.env.AZURE_OPENAI_MAX_TOKENS || '500'),
          requestsPerMinute: parseInt(process.env.AZURE_OPENAI_RPM || '60'),
          tokensPerMinute: parseInt(process.env.AZURE_OPENAI_TPM || '60000'),
          requestsPerDay: parseInt(process.env.AZURE_OPENAI_RPD || '10000'),
          weight: parseFloat(process.env.AZURE_OPENAI_WEIGHT || '1.0')
        });
      }
    } else {
      // Multiple models
      for (const modelName of modelNames) {
        const prefix = `LLM_MODEL_${modelName.toUpperCase()}_`;
        const endpoint = process.env[`${prefix}ENDPOINT`];
        const apiKey = process.env[`${prefix}API_KEY`];
        
        if (endpoint && apiKey) {
          configs.push({
            apiKey: apiKey,
            endpoint: endpoint,
            deploymentName: process.env[`${prefix}DEPLOYMENT`] || modelName,
            apiVersion: process.env[`${prefix}API_VERSION`] || '2024-02-15-preview',
            temperature: parseFloat(process.env[`${prefix}TEMPERATURE`] || '0.7'),
            maxTokens: parseInt(process.env[`${prefix}MAX_TOKENS`] || '500'),
            requestsPerMinute: parseInt(process.env[`${prefix}RPM`] || '60'),
            tokensPerMinute: parseInt(process.env[`${prefix}TPM`] || '60000'),
            requestsPerDay: parseInt(process.env[`${prefix}RPD`] || '10000'),
            weight: parseFloat(process.env[`${prefix}WEIGHT`] || '1.0')
          });
        }
      }
    }
    
    return configs;
  }
  
  get rooms() {
    return this.queueManager.rooms;
  }
  onConnection(socket: Socket) {
    console.log("Connect", socket.id);
    this.sockets.set(socket.id, null);
    socket.on("disconnect", () => this.onDisconnect(socket));
    socket.on("action", (action: AnyAction) => this.onAction(socket, action));
  }
  onDisconnect(socket: Socket) {
    console.log("Disconnect", socket.id);
    const roomID = this.sockets.get(socket.id);
    this.sockets.delete(socket.id);
    
    // Remove from queue if in queue
    this.queueManager.removeFromQueue(socket.id);
    
    if (!roomID) return;
    const room = this.rooms.get(roomID);
    if (!room) return;
    room.onLeave(socket, this.io);
    if (room.store.getState().memberIDs.length === 0) {
      console.log("Lobby closed:", roomID);
      this.rooms.delete(roomID);
      this.idManager.releaseCode(roomID);
    }
  }
  onAction(socket: Socket, action: AnyAction) {
    const clientJoinQueue = LobbyAction.clientJoinQueue.type;
    const clientLeaveQueue = LobbyAction.clientLeaveQueue.type;
    const clientLeaveLobby = LobbyAction.clientLeaveLobby.type;
    
    if (action.type === clientJoinQueue) {
      // Protect against double join
      if (this.sockets.get(socket.id)) {
        return;
      }
      // Add to queue with difficulty
      const difficulty = (action as any).payload?.difficulty;
      if (!difficulty || !["easy", "medium", "hard"].includes(difficulty)) {
        console.error("Invalid or missing difficulty in clientJoinQueue action");
        return;
      }
      this.queueManager.addToQueue(socket, difficulty);
    } else if (action.type === clientLeaveQueue) {
      // Remove from queue
      this.queueManager.removeFromQueue(socket.id);
      socket.emit("action", actionFromServer(LobbyAction.reset()));
    } else if (action.type === clientLeaveLobby) {
      const roomID = this.sockets.get(socket.id);
      if (!roomID) return;
      const room = this.rooms.get(roomID);
      if (!room) return;

      this.sockets.set(socket.id, null);
      room.onLeave(socket, this.io);
      socket.emit("action", actionFromServer(LobbyAction.reset()));
      if (room.store.getState().memberIDs.length === 0) {
        console.log("Lobby closed:", roomID);
        this.rooms.delete(roomID);
        this.idManager.releaseCode(roomID);
      }
    } else {
      const roomID = this.sockets.get(socket.id);
      if (!roomID) return;
      const room = this.rooms.get(roomID);
      if (!room) return;
      room.onAction(action, socket, this.io);
      
      // Note: AI agent routing for game actions is handled in Game.onAction via the router
      // Only initialize agents here for game start actions
      if (this.useLLMAgents && this.aiAgentManager && action.type.startsWith('game/')) {
        const gameState = room.game?.store.getState();
        if (gameState) {
          // Initialize AI agents if game just started
          if (action.type === 'game/hydrate' || action.type === 'game/initialize') {
            this.initializeAIAgentsInGame(room, gameState);
          }
          // Don't route here - Game.onAction already routes to all AI agents via the router
        }
      }
    }
  }
  
  // Method to create AI agent and add to queue
  async createAIAgent(difficulty: "easy" | "medium" | "hard" = "easy"): Promise<Socket | null> {
    if (!this.useLLMAgents || !this.aiAgentManager) {
      return null;
    }
    
    try {
      // Create a mock socket for the AI agent
      const socketId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const playerName = this.queueManager.generateRandomName();
      
      // Create a minimal socket-like object that properly integrates with Socket.io
      const mockSocket = {
        id: socketId,
        emit: (event: string, data: any) => {
          // When AI agent emits actions, route them through the server
          if (event === 'action' && data.type) {
            const roomID = this.sockets.get(socketId);
            if (roomID) {
              const room = this.rooms.get(roomID);
              if (room) {
                room.onAction(data, mockSocket as unknown as Socket, this.io);
              }
            }
          }
        },
        join: (room: string) => {
          // Actually join the Socket.io room
          const roomObj = this.io.sockets.adapter.rooms.get(room);
          if (!roomObj) {
            this.io.sockets.adapter.rooms.set(room, new Set());
          }
          this.io.sockets.adapter.rooms.get(room)?.add(socketId);
        },
        leave: (room: string) => {
          this.io.sockets.adapter.rooms.get(room)?.delete(socketId);
        },
        on: () => {},
        off: () => {},
        disconnect: () => {
          // Remove from all rooms and queue
          this.queueManager.removeFromQueue(socketId);
          if (this.aiAgentManager) {
            this.aiAgentManager.removeAgent(socketId);
          }
        },
        rooms: new Set<string>()
      } as unknown as Socket;
      
      // Add to queue (mark as AI)
      this.sockets.set(socketId, null);
      this.queueManager.addToQueue(mockSocket, difficulty, true); // difficulty, isAI
      
      // Create AI agent with temporary player index (will be updated when game starts)
      const tempPlayerIndex = -1;
      this.aiAgentManager!.createAgentWithModel(socketId, tempPlayerIndex, playerName, mockSocket);
      
      return mockSocket;
    } catch (error) {
      console.error('Failed to create AI agent:', error);
      return null;
    }
  }
  
  getLLMAgentStats() {
    if (!this.aiAgentManager) {
      return null;
    }
    return this.aiAgentManager.getAllUsageStats();
  }
  
  getModelComparisonReport() {
    if (!this.aiAgentManager) {
      return null;
    }
    return this.aiAgentManager.getModelComparisonReport();
  }
  
  private initializeAIAgentsInGame(room: Lobby, gameState: GameState): void {
    if (!this.aiAgentManager) return;
    
    // Find AI agent sockets and initialize them with their player indices
    gameState.player.socketIDs.forEach((socketId, playerIndex) => {
      if (socketId && socketId.startsWith('ai_')) {
        const agent = this.aiAgentManager!.agents.get(socketId);
        if (agent && !agent.role) {
          const role = gameState.player.roles[playerIndex];
          const team = this.getTeamFromRole(role);
          const visiblePlayers = this.getVisiblePlayers(gameState, playerIndex, role);
          agent.initialize(role, team, visiblePlayers);
          
          // Update player index
          agent.playerIndex = playerIndex;
          agent.playerName = gameState.player.names[playerIndex];
        }
      }
    });
  }
  
  private getTeamFromRole(role: string): 'agent' | 'spy' {
    const evilRoles = ['spy', 'assassin', 'imposter', 'mole', 'intern', 'morgana', 'mordred', 'oberon'];
    return evilRoles.includes(role) ? 'spy' : 'agent';
  }
  
  private getVisiblePlayers(gameState: GameState, playerIndex: number, role: string): Array<{ playerId: number; name: string; role: string; reason: string }> {
    const visible: Array<{ playerId: number; name: string; role: string; reason: string }> = [];
    
    if (role === 'merlin' || role === 'captain') {
      gameState.player.roles.forEach((r, idx) => {
        if (idx !== playerIndex && (r === 'spy' || r === 'morgana' || r === 'assassin' || r === 'mordred' || r === 'imposter' || r === 'mole')) {
          if (role === 'merlin' && r === 'mordred') return;
          visible.push({
            playerId: idx,
            name: gameState.player.names[idx],
            role: r,
            reason: 'evil_team'
          });
        }
      });
    } else if (role === 'spy' || role === 'morgana' || role === 'assassin' || role === 'mordred' || role === 'imposter' || role === 'mole') {
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
    } else if (role === 'percival' || role === 'deputy') {
      gameState.player.roles.forEach((r, idx) => {
        if (idx !== playerIndex && (r === 'merlin' || r === 'morgana' || r === 'captain' || r === 'imposter')) {
          visible.push({
            playerId: idx,
            name: gameState.player.names[idx],
            role: r === 'merlin' || r === 'captain' ? 'merlin_or_captain' : 'morgana_or_impostor',
            reason: 'special_sight'
          });
        }
      });
    }
    
    return visible;
  }
}
