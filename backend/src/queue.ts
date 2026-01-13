import { AnyAction } from "@reduxjs/toolkit";
import { LobbyAction, GameAction } from "common-modules";
import socketIO, { Socket } from "socket.io";
import { Lobby, Game } from "./lobby";
import { actionFromServer, RoomCodeManager } from "./util";
import { GameMinPlayers, GameMaxPlayers } from "common-modules";
import { GameDatabase } from "./database";

// Animal names for randomized usernames
const ANIMAL_NAMES = [
  "dog", "cat", "chicken", "rabbit", "elephant", "tiger", "lion", "bear", "wolf", "fox",
  "deer", "owl", "eagle", "hawk", "penguin", "dolphin", "whale", "shark", "octopus", "crab",
  "butterfly", "bee", "ant", "spider", "snake", "lizard", "frog", "turtle", "fish", "bird",
  "horse", "cow", "pig", "sheep", "goat", "duck", "goose", "swan", "parrot", "peacock",
  "panda", "koala", "kangaroo", "zebra", "giraffe", "hippo", "rhino", "monkey", "gorilla", "sloth"
];

type Difficulty = "easy" | "medium" | "hard";
type QueueEntry = { socket: Socket; name: string; socketId: string; isAI?: boolean; difficulty: Difficulty };

const DIFFICULTY_PLAYER_COUNTS: { [key in Difficulty]: number } = {
  easy: 5,
  medium: 7,
  hard: 9,
};

const DIFFICULTY_GAME_MODES: { [key in Difficulty]: "avalon_easy" | "avalon_medium" | "avalon_hard" } = {
  easy: "avalon_easy",
  medium: "avalon_medium",
  hard: "avalon_hard",
};

export class QueueManager {
  private queues: Map<Difficulty, Array<QueueEntry>>;
  public rooms: Map<string, Lobby>;
  private idManager: RoomCodeManager;
  private io: socketIO.Server;
  private sockets: Map<string, string | null>;
  private database: GameDatabase;

  constructor(io: socketIO.Server, sockets: Map<string, string | null>, database: GameDatabase) {
    this.queues = new Map();
    this.queues.set("easy", []);
    this.queues.set("medium", []);
    this.queues.set("hard", []);
    this.rooms = new Map();
    this.idManager = new RoomCodeManager();
    this.io = io;
    this.sockets = sockets;
    this.database = database;
  }

  generateRandomName(excludeNames: Set<string> = new Set()): string {
    // Filter out names that are already taken
    const availableNames = ANIMAL_NAMES.filter(name => !excludeNames.has(name));
    
    if (availableNames.length === 0) {
      // If all names are taken, fall back to adding a number
      const randomIndex = Math.floor(Math.random() * ANIMAL_NAMES.length);
      const baseName = ANIMAL_NAMES[randomIndex];
      let counter = 1;
      let uniqueName = `${baseName}${counter}`;
      while (excludeNames.has(uniqueName)) {
        counter++;
        uniqueName = `${baseName}${counter}`;
      }
      return uniqueName;
    }
    
    const randomIndex = Math.floor(Math.random() * availableNames.length);
    return availableNames[randomIndex];
  }

  addToQueue(socket: Socket, difficulty: Difficulty, isAI: boolean = false) {
    const name = this.generateRandomName();
    const queue = this.queues.get(difficulty);
    if (!queue) {
      console.error(`Invalid difficulty: ${difficulty}`);
      return;
    }
    
    const queueEntry: QueueEntry = { socket, name, socketId: socket.id, isAI, difficulty };
    queue.push(queueEntry);
    const aiLabel = isAI ? " (AI)" : "";
    console.log(`Player ${name}${aiLabel} joined ${difficulty} queue. Queue size: ${queue.length}`);
    
    // Notify the player they're in queue (only if not AI)
    if (!isAI) {
      socket.emit("action", actionFromServer(LobbyAction.updateQueueState({ 
        inQueue: true, 
        queuePosition: queue.length,
        name 
      })));
    }

    // Check if we have enough players to start a game for this difficulty
    this.checkAndStartGame(difficulty);
  }

  removeFromQueue(socketId: string) {
    // Search all queues for this socket
    for (const [difficulty, queue] of this.queues.entries()) {
      const index = queue.findIndex(entry => entry.socketId === socketId);
      if (index !== -1) {
        const removed = queue.splice(index, 1)[0];
        console.log(`Player ${removed.name} left ${difficulty} queue. Queue size: ${queue.length}`);
        
        // Update queue positions for remaining players in this difficulty
        this.updateQueuePositions(difficulty);
        return;
      }
    }
  }

  private updateQueuePositions(difficulty: Difficulty) {
    const queue = this.queues.get(difficulty);
    if (!queue) return;
    
    queue.forEach((entry, index) => {
      if (!entry.isAI) {
        entry.socket.emit("action", actionFromServer(LobbyAction.updateQueueState({ 
          inQueue: true, 
          queuePosition: index + 1,
          name: entry.name 
        })));
      }
    });
  }

  private checkAndStartGame(difficulty: Difficulty) {
    const queue = this.queues.get(difficulty);
    if (!queue) return;
    
    const requiredPlayers = DIFFICULTY_PLAYER_COUNTS[difficulty];
    
    if (queue.length >= requiredPlayers) {
      // Check if there's at least one human player (not AI)
      const hasHumanPlayer = queue.some(entry => !entry.isAI);
      
      // Only create lobby if there's at least one human player
      // This prevents AI-only lobbies from being created
      if (!hasHumanPlayer) {
        console.log(`${difficulty} queue has ${queue.length} AI players, waiting for human player to join...`);
        return;
      }
      
      // Take exactly the required number of players for this difficulty
      const playersForGame = queue.splice(0, requiredPlayers);
      
      // Ensure all players have unique names within this game
      const usedNames = new Set<string>();
      playersForGame.forEach((player) => {
        if (usedNames.has(player.name)) {
          // Regenerate name if duplicate found
          player.name = this.generateRandomName(usedNames);
        }
        usedNames.add(player.name);
      });
      
      const aiCount = playersForGame.filter(p => p.isAI).length;
      const humanCount = playersForGame.length - aiCount;
      console.log(`Starting ${difficulty} game with ${playersForGame.length} players (${humanCount} human, ${aiCount} AI)`);
      console.log(`Player names: ${playersForGame.map(p => p.name).join(", ")}`);
      
      // Create a new lobby/game
      const roomID = this.idManager.generateCode();
      const room = new Lobby(roomID, this.database);
      
      // Set the game mode based on difficulty
      const gameMode = DIFFICULTY_GAME_MODES[difficulty];
      room.store.dispatch(LobbyAction.updateGameOptions({ options: gameMode }));
      // Broadcast game mode to all players (they'll get it when they join, but this ensures it's set)
      
      this.rooms.set(roomID, room);
      
      // Add all players to the room with their unique names
      playersForGame.forEach(({ socket, name, socketId }) => {
        socket.join(roomID);
        room.onJoin(name, socket, this.io);
        // Update socket mapping in server
        this.sockets.set(socketId, roomID);
        
        // Notify player of their final name (in case it was regenerated)
        if (!socket.id.startsWith('ai_')) {
          socket.emit("action", actionFromServer(LobbyAction.updateQueueState({ 
            inQueue: false, 
            queuePosition: 0,
            name 
          })));
        }
      });
      
      // Broadcast game mode update to all players in the room
      const updateGameOptionsAction = LobbyAction.updateGameOptions({ options: gameMode });
      this.io.to(roomID).emit("action", actionFromServer(updateGameOptionsAction));
      
      // Update queue positions for remaining players in this difficulty
      this.updateQueuePositions(difficulty);
      
      // Auto-start the game since we have the right number of players
      this.startGame(roomID);
    }
  }

  private startGame(roomID: string) {
    const room = this.rooms.get(roomID);
    if (!room) return;

    const numPlayers = room.store.getState().memberIDs.length;
    if (numPlayers < GameMinPlayers || numPlayers > GameMaxPlayers) {
      return;
    }

    // Create game
    const gameOptions = {
      socketIDs: room.store.getState().memberIDs,
      names: room.store.getState().names,
      seed: new Date().getTime() % 10_000,
      gamemode: room.store.getState().gameInitOptions,
    };
    
    // Create game instance
    room.game = new Game(gameOptions, roomID, this.database);

    // Set up AI agent router for this game
    room.setupAIAgentRouter(this.io);

    // Save game start to database
    const gameInitOptions = room.store.getState().gameInitOptions;
    const gameMode = typeof gameInitOptions === "string" 
      ? gameInitOptions 
      : "custom";
    const difficulty = typeof gameMode === "string" && gameMode.startsWith("avalon_") 
      ? gameMode.replace("avalon_", "") as "easy" | "medium" | "hard"
      : null;
    const initialGameState = room.game.store.getState();
    // Determine which players are AI (socketIDs starting with 'ai_')
    const playerIsAI = initialGameState.player.socketIDs.map(
      socketID => socketID !== null && socketID.startsWith('ai_')
    );
    this.database.startGame(
      roomID,
      gameMode,
      difficulty,
      initialGameState.player.names,
      initialGameState.player.roles,
      playerIsAI
    );

    // Get everyone to join game
    const hydrateGameStateAction = GameAction.hydrate(
      room.game.store.getState()
    );
    this.io.to(roomID).emit("action", actionFromServer(hydrateGameStateAction));

    // Initialize AI agents when game starts
    room.initializeAIAgents(initialGameState, this.io);

    const updateGameStateAction = LobbyAction.updateGameState({
      inGame: true,
    });
    room.store.dispatch(updateGameStateAction);
    this.io.to(roomID).emit("action", actionFromServer(updateGameStateAction));

    // Start game
    console.log("Game start:", roomID);
    room.game.start(this.io);
  }

  getQueueSize(difficulty?: Difficulty): number {
    if (difficulty) {
      return this.queues.get(difficulty)?.length || 0;
    }
    // Return total across all queues
    return Array.from(this.queues.values()).reduce((sum, queue) => sum + queue.length, 0);
  }

  getActiveGames(): number {
    return Array.from(this.rooms.values()).filter(room => room.game !== null).length;
  }

  getTotalRooms(): number {
    return this.rooms.size;
  }

  cleanupRoom(roomID: string) {
    this.rooms.delete(roomID);
    this.idManager.releaseCode(roomID);
  }
}
