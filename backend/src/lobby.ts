import { AnyAction, configureStore, Store } from "@reduxjs/toolkit";
import {
  GameAction,
  GameInitOptions,
  GameMaxPlayers,
  GameMinPlayers,
  GameReducer,
  GameState,
  LobbyAction,
  LobbyReducer,
  LobbyState,
} from "common-modules";
import { Server, Socket } from "socket.io";
import { actionFromServer } from "./util";
import { GameDatabase } from "./database";

type LobbyStore = Store<LobbyState>;

export class Lobby {
  store: LobbyStore;
  game: Game | null;
  database: GameDatabase;
  get id() {
    return this.store.getState().id;
  }

  constructor(id: string, database: GameDatabase) {
    this.store = configureStore({
      reducer: LobbyReducer,
    });
    this.store.dispatch(LobbyAction.initialize({ id }));
    this.game = null;
    this.database = database;
  }
  onJoin(name: string, socket: Socket, io: Server) {
    const memberJoinAction = LobbyAction.memberJoin({
      name,
      memberID: socket.id,
    });
    this.store.dispatch(memberJoinAction);
    io.to(this.id).emit("action", actionFromServer(memberJoinAction));

    socket.join(this.id);
    const hydrateAction = LobbyAction.hydrate(this.store.getState());
    socket.emit("action", actionFromServer(hydrateAction));

    // Hydrate game too
    if (this.game) {
      const hydrateGameAction = GameAction.hydrate(this.game.store.getState());
      socket.emit("action", actionFromServer(hydrateGameAction));
    }
  }
  onAction(action: AnyAction, socket: Socket, io: Server) {
    const clientStartGame = LobbyAction.clientStartGame.type;
    const clientLeaveGame = LobbyAction.clientLeaveGame.type;
    const clientRejoinGame = LobbyAction.clientRejoinGame.type;
    
    // Route game actions to AI agents
    if (action.type.startsWith('game/') && this.game) {
      const gameState = this.game.store.getState();
      // AI agents will handle actions in their handleAction method
    }
    
    if (action.type === clientStartGame) {
      // Safeguard
      if (this.game !== null) {
        return;
      }
      const numPlayers = this.store.getState().memberIDs.length;
      if (numPlayers < GameMinPlayers || numPlayers > GameMaxPlayers) {
        return;
      }

      // Create game
      const gameOptions: GameInitOptions = {
        socketIDs: this.store.getState().memberIDs,
        names: this.store.getState().names,
        // Should be good enough
        seed: new Date().getTime() % 10_000,
        gamemode: this.store.getState().gameInitOptions,
      };
      this.game = new Game(gameOptions, this.id, this.database);
      
      // Save game start to database
      const gameInitOptions = this.store.getState().gameInitOptions;
      const gameMode = typeof gameInitOptions === "string" 
        ? gameInitOptions 
        : "custom";
      const difficulty = typeof gameMode === "string" && gameMode.startsWith("avalon_") 
        ? gameMode.replace("avalon_", "") as "easy" | "medium" | "hard"
        : null;
      const initialGameState = this.game.store.getState();
      // Determine which players are AI (socketIDs starting with 'ai_')
      const playerIsAI = initialGameState.player.socketIDs.map(
        socketID => socketID !== null && socketID.startsWith('ai_')
      );
      
      // Get participant codes for each player (null for AI players)
      const server = (io as any).serverInstance;
      const playerParticipantCodes = initialGameState.player.socketIDs.map(
        socketID => {
          if (!socketID || socketID.startsWith('ai_')) {
            return null; // AI players don't have participant codes
          }
          // Get participant code from server if available
          return server?.getParticipantCodeForSocket?.(socketID) || null;
        }
      );
      
      this.database.startGame(
        this.id,
        gameMode,
        difficulty,
        initialGameState.player.names,
        initialGameState.player.roles,
        playerIsAI,
        playerParticipantCodes
      );
      
      // Set up AI agent router for this game
      this.setupAIAgentRouter(io);

      // Get everyone to join game
      const gameState = this.game.store.getState();
      const hydrateGameStateAction = GameAction.hydrate(gameState);
      io.to(this.id).emit("action", actionFromServer(hydrateGameStateAction));
      
      // Initialize AI agents when game starts
      this.initializeAIAgents(gameState, io);

      const updateGameStateAction = LobbyAction.updateGameState({
        inGame: true,
      });
      this.store.dispatch(updateGameStateAction);
      io.to(this.id).emit("action", actionFromServer(updateGameStateAction));

      // Start game
      console.log("Game start:", this.id);
      this.game.start(io);
    } else if (action.type === clientLeaveGame) {
      this.handleUserLeaveGame(socket, io);
    } else if (action.type === clientRejoinGame) {
      if (this.game) {
        const state = this.store.getState();
        const index = state.memberIDs.indexOf(socket.id);
        const name = state.names[index];
        this.game.onRejoin(socket.id, name, action.payload.index, io);
      }
    } else if ((action.type as string).startsWith("lobby/")) {
      this.store.dispatch(action);
      io.to(this.id).emit("action", actionFromServer(action));
    } else if ((action.type as string).startsWith("game/")) {
      if (this.game) {
        this.game.onAction(action, socket, io);
      }
    }
  }
  onLeave(socket: Socket, io: Server) {
    this.handleUserLeaveGame(socket, io);

    const memberLeaveAction = LobbyAction.memberLeave({ memberID: socket.id });
    this.store.dispatch(memberLeaveAction);
    io.to(this.id).emit("action", actionFromServer(memberLeaveAction));
  }
  // Used twice
  handleUserLeaveGame(socket: Socket, io: Server) {
    if (this.game === null) return;
    this.game.onLeave(socket.id, io);

    // Delete the game if necessary
    if (this.game === null) return;
    const socketIDs = this.game?.store.getState().player.socketIDs;
    const count = socketIDs?.reduce((a, v) => (v === null ? a : a + 1), 0);
    if (count === 0) {
      // Game end
      console.log("Game end:", this.id);
      
      // In research mode, re-add human players to queue
      const server = (io as any).serverInstance;
      if (server && server.isResearchMode && server.isResearchMode()) {
        const gameState = this.game.store.getState();
        const playerNames = gameState.player.names;
        const playerSocketIDs = gameState.player.socketIDs;
        
        // Re-add human players to queue (use "easy" as default in research mode)
        playerSocketIDs.forEach((socketID, index) => {
          if (socketID && !socketID.startsWith('ai_')) {
            // Find the socket and re-add to queue
            const socket = io.sockets.sockets.get(socketID);
            if (socket) {
              // Remove from room mapping first
              server.sockets.delete(socketID);
              socket.leave(this.id);
              
              // Re-add to queue with a new random name (forceNewName=true ensures fresh name)
              server.queueManager.addToQueue(socket, "easy", false, true);
            }
          }
        });
      }
      
      this.game.stop();
      this.game = null;
      const updateGameStateAction = LobbyAction.updateGameState({
        inGame: false,
      });
      this.store.dispatch(updateGameStateAction);
      io.to(this.id).emit("action", actionFromServer(updateGameStateAction));
    }
  }
  
  initializeAIAgents(gameState: GameState, io: Server): void {
    // Initialize AI agents when game starts
    // The router will handle initialization when actions are routed
    // But we can trigger it by routing a hydrate action
    const server = (io as any).serverInstance;
    if (server && server.useLLMAgents && server.aiAgentManager && this.game) {
      // Route hydrate action to initialize all AI agents
      const hydrateAction = { type: 'game/hydrate', payload: gameState };
      gameState.player.socketIDs.forEach((socketId) => {
        if (socketId && socketId.startsWith('ai_')) {
          server.aiAgentManager.routeActionToAgent(socketId, hydrateAction as any, gameState);
        }
      });
    }
  }
  
  setupAIAgentRouter(io: Server): void {
    if (!this.game) return;
    
    // Create router function that routes actions to all AI agents in this game
    const router = (action: AnyAction, gameState: GameState) => {
      // Only route game actions (not lobby actions)
      if (!action.type.startsWith('game/')) return;
      
      // Route to all AI agent sockets in this game
      gameState.player.socketIDs.forEach((socketId, playerIndex) => {
        if (socketId && socketId.startsWith('ai_')) {
          // Access server's AI agent manager through io
          const server = (io as any).serverInstance;
          if (server && server.useLLMAgents && server.aiAgentManager) {
            // Only log chat messages to reduce noise
            if (action.type === 'game/new-player-chat-message') {
              console.log(`[AI Router] Routing chat message to AI agent ${socketId} (player ${playerIndex})`);
            }
            server.aiAgentManager.routeActionToAgent(socketId, action, gameState);
          }
        }
      });
    };
    
    this.game.setAIAgentRouter(router);
  }
}

type GameStore = Store<GameState>;

export class Game {
  roomID: string;
  timeout: NodeJS.Timeout | null;
  store: GameStore;
  database: GameDatabase;
  private routeToAIAgents: ((action: AnyAction, gameState: GameState) => void) | null = null;
  private lastChatLength: number = 0;
  private lastTeamHistoryLength: number = 0;
  private lastMissionHistoryLength: number = 0;
  
  constructor(options: GameInitOptions, roomID: string, database: GameDatabase) {
    this.roomID = roomID;
    this.database = database;
    this.store = configureStore({
      reducer: GameReducer,
    });
    this.store.dispatch(GameAction.initialize(options));
    this.timeout = null;
  }
  
  setAIAgentRouter(router: (action: AnyAction, gameState: GameState) => void) {
    this.routeToAIAgents = router;
  }
  
  start(io: Server) {
    if (!this.timeout) {
      this.timeout = setInterval(() => this.tick(io), 1000);
    }
  }
  stop() {
    if (this.timeout) {
      clearInterval(this.timeout);
    }
  }
  tick(io: Server) {
    const tickAction = GameAction.tick();
    this.store.dispatch(tickAction);
    const gameState = this.store.getState();
    io.to(this.roomID).emit("action", actionFromServer(tickAction));
    
    // Save game state changes
    this.saveGameStateChanges(gameState, io);
    
    // Route tick action to all AI agents
    if (this.routeToAIAgents) {
      this.routeToAIAgents(tickAction, gameState);
    }
    
    if (gameState.game.phase === "finished") {
      this.stop();
      // Save game end
      this.database.endGame(this.roomID, gameState.winner);
      
      // In research mode, re-add human players to queue after a short delay
      const server = (io as any).serverInstance;
      if (server && server.isResearchMode && server.isResearchMode()) {
        setTimeout(() => {
          const finalGameState = this.store.getState();
          const playerSocketIDs = finalGameState.player.socketIDs;
          
          // Re-add human players to queue
          playerSocketIDs.forEach((socketID) => {
            if (socketID && !socketID.startsWith('ai_')) {
              const socket = io.sockets.sockets.get(socketID);
              if (socket) {
                // Check if player is still connected and not already in queue
                const roomID = server.sockets.get(socketID);
                if (roomID === this.roomID) {
                  // Remove from room mapping
                  server.sockets.delete(socketID);
                  socket.leave(this.roomID);
                  
                  // Re-add to queue with a new random name (forceNewName=true ensures fresh name)
                  server.queueManager.addToQueue(socket, "easy", false, true);
                }
              }
            }
          });
        }, 2000); // 2 second delay to allow game end UI to show
      }
    }
  }
  
  onAction(action: AnyAction, socket: Socket, io: Server) {
    const gameState = this.store.getState();
    
    // Validate turn-based chat messages
    if (action.type === 'game/new-player-chat-message' || action.type === 'game/auto-send-chat-message') {
      const playerIndex = gameState.player.socketIDs.indexOf(socket.id);
      
      // Check if speaking turn system is active
      if (gameState.speakingTurn) {
        // Allow current speaker OR auto-send messages (which may arrive slightly after turn ends)
        const isCurrentSpeaker = playerIndex === gameState.speakingTurn.currentSpeaker;
        const isAutoSend = action.type === 'game/auto-send-chat-message';
        
        // For auto-send, also check if this player was the previous speaker
        // (in case the turn just ended and message is arriving late)
        let wasPreviousSpeaker = false;
        if (isAutoSend && !isCurrentSpeaker) {
          // Check if this player was speaking recently (within last turn cycle)
          const turnOrder = gameState.speakingTurn.turnOrder;
          const currentIndex = gameState.speakingTurn.turnIndex;
          const previousIndex = (currentIndex - 1 + turnOrder.length) % turnOrder.length;
          wasPreviousSpeaker = turnOrder[previousIndex] === playerIndex;
        }
        
        if (!isCurrentSpeaker && !wasPreviousSpeaker) {
          console.log(`[Game ${this.roomID}] Player ${playerIndex} tried to chat but it's not their turn (current speaker: ${gameState.speakingTurn.currentSpeaker})`);
          return; // Reject the action
        }
      }
    }
    
    // Validate pass speaking turn action
    if (action.type === 'game/pass-speaking-turn') {
      const playerIndex = gameState.player.socketIDs.indexOf(socket.id);
      
      if (gameState.speakingTurn && playerIndex !== gameState.speakingTurn.currentSpeaker) {
        console.log(`[Game ${this.roomID}] Player ${playerIndex} tried to pass but it's not their turn`);
        return; // Reject the action
      }
    }
    
    this.store.dispatch(action);
    const newGameState = this.store.getState();
    io.to(this.roomID).emit("action", actionFromServer(action));
    
    // Save action to database with participant code
    const server = (io as any).serverInstance;
    const playerIndex = gameState.player.socketIDs.indexOf(socket.id);
    const participantCode = playerIndex >= 0 && socket.id && !socket.id.startsWith('ai_')
      ? (server?.getParticipantCodeForSocket?.(socket.id) || null)
      : null;
    this.database.saveAction(this.roomID, action, newGameState, participantCode);
    
    // Save game state changes (chats, teams, missions)
    this.saveGameStateChanges(newGameState, io);
    
    // Route action to all AI agents in this room
    if (this.routeToAIAgents) {
      this.routeToAIAgents(action, newGameState);
    }
  }
  
  private saveGameStateChanges(gameState: GameState, io?: Server) {
    // Save new chat messages
    if (gameState.chat.length > this.lastChatLength) {
      const newMessages = gameState.chat.slice(this.lastChatLength);
      const server = io ? (io as any).serverInstance : null;
      newMessages.forEach(msg => {
        // Get participant code for player messages
        let participantCode: string | null = null;
        if (msg.type === "player" && msg.player !== null && server) {
          const socketID = gameState.player.socketIDs[msg.player];
          if (socketID && !socketID.startsWith('ai_')) {
            participantCode = server.getParticipantCodeForSocket?.(socketID) || null;
          }
        }
        this.database.saveChatMessage(this.roomID, msg, participantCode);
      });
      this.lastChatLength = gameState.chat.length;
    }
    
    // Save new teams (proposals)
    if (gameState.teamHistory.length > this.lastTeamHistoryLength) {
      const newTeams = gameState.teamHistory.slice(this.lastTeamHistoryLength);
      newTeams.forEach(team => {
        // Check if team was approved (has votes)
        const approved = team.votes.some(v => v !== "none");
        this.database.saveTeam(this.roomID, team, approved);
      });
      this.lastTeamHistoryLength = gameState.teamHistory.length;
    }
    
    // Save new missions
    if (gameState.missionHistory.length > this.lastMissionHistoryLength) {
      const newMissions = gameState.missionHistory.slice(this.lastMissionHistoryLength);
      newMissions.forEach(mission => {
        // Determine mission result
        const failCount = mission.actions.filter(a => a === "fail").length;
        const result = failCount > 0 ? "fail" : "success";
        this.database.saveMission(this.roomID, mission, result);
      });
      this.lastMissionHistoryLength = gameState.missionHistory.length;
    }
  }
  onRejoin(socketID: string, name: string, index: number, io: Server) {
    const playerRejoinAction = GameAction.playerReconnect({
      index,
      socketID,
      name,
    });
    this.store.dispatch(playerRejoinAction);
    io.to(this.roomID).emit("action", actionFromServer(playerRejoinAction));
  }
  onLeave(socketID: string, io: Server) {
    const playerDisconnectAction = GameAction.playerDisconnect({ socketID });
    this.store.dispatch(playerDisconnectAction);
    io.to(this.roomID).emit("action", actionFromServer(playerDisconnectAction));
  }
}
