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
      this.database.startGame(
        this.id,
        gameMode,
        difficulty,
        initialGameState.player.names,
        initialGameState.player.roles
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
      // Start game
      console.log("Game end:", this.id);
      this.game.stop();
      this.game = null;
      const updateGameStateAction = LobbyAction.updateGameState({
        inGame: false,
      });
      this.store.dispatch(updateGameStateAction);
      io.to(this.id).emit("action", actionFromServer(updateGameStateAction));
    }
  }
  
  private initializeAIAgents(gameState: GameState, io: Server): void {
    // Initialize AI agents when game starts
    // This is handled by the Server class via the router
  }
  
  private setupAIAgentRouter(io: Server): void {
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
    this.saveGameStateChanges(gameState);
    
    // Route tick action to all AI agents
    if (this.routeToAIAgents) {
      this.routeToAIAgents(tickAction, gameState);
    }
    
    if (gameState.game.phase === "finished") {
      this.stop();
      // Save game end
      this.database.endGame(this.roomID, gameState.winner);
    }
  }
  
  onAction(action: AnyAction, socket: Socket, io: Server) {
    this.store.dispatch(action);
    const gameState = this.store.getState();
    io.to(this.roomID).emit("action", actionFromServer(action));
    
    // Save action to database
    this.database.saveAction(this.roomID, action, gameState);
    
    // Save game state changes (chats, teams, missions)
    this.saveGameStateChanges(gameState);
    
    // Route action to all AI agents in this room
    if (this.routeToAIAgents) {
      this.routeToAIAgents(action, gameState);
    }
  }
  
  private saveGameStateChanges(gameState: GameState) {
    // Save new chat messages
    if (gameState.chat.length > this.lastChatLength) {
      const newMessages = gameState.chat.slice(this.lastChatLength);
      newMessages.forEach(msg => {
        this.database.saveChatMessage(this.roomID, msg);
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
