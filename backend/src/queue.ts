import { AnyAction } from "@reduxjs/toolkit";
import { LobbyAction, GameAction } from "common-modules";
import socketIO, { Socket } from "socket.io";
import { Lobby, Game } from "./lobby";
import { actionFromServer, RoomCodeManager } from "./util";
import { GameMinPlayers, GameMaxPlayers } from "common-modules";

// Animal names for randomized usernames
const ANIMAL_NAMES = [
  "dog", "cat", "chicken", "rabbit", "elephant", "tiger", "lion", "bear", "wolf", "fox",
  "deer", "owl", "eagle", "hawk", "penguin", "dolphin", "whale", "shark", "octopus", "crab",
  "butterfly", "bee", "ant", "spider", "snake", "lizard", "frog", "turtle", "fish", "bird",
  "horse", "cow", "pig", "sheep", "goat", "duck", "goose", "swan", "parrot", "peacock",
  "panda", "koala", "kangaroo", "zebra", "giraffe", "hippo", "rhino", "monkey", "gorilla", "sloth"
];

export class QueueManager {
  private queue: Array<{ socket: Socket; name: string; socketId: string }>;
  public rooms: Map<string, Lobby>;
  private idManager: RoomCodeManager;
  private io: socketIO.Server;
  private sockets: Map<string, string | null>;

  constructor(io: socketIO.Server, sockets: Map<string, string | null>) {
    this.queue = [];
    this.rooms = new Map();
    this.idManager = new RoomCodeManager();
    this.io = io;
    this.sockets = sockets;
  }

  generateRandomName(): string {
    const randomIndex = Math.floor(Math.random() * ANIMAL_NAMES.length);
    return ANIMAL_NAMES[randomIndex];
  }

  addToQueue(socket: Socket) {
    const name = this.generateRandomName();
    const queueEntry = { socket, name, socketId: socket.id };
    
    this.queue.push(queueEntry);
    console.log(`Player ${name} joined queue. Queue size: ${this.queue.length}`);
    
    // Notify the player they're in queue
    socket.emit("action", actionFromServer(LobbyAction.updateQueueState({ 
      inQueue: true, 
      queuePosition: this.queue.length,
      name 
    })));

    // Check if we have enough players to start a game
    this.checkAndStartGame();
  }

  removeFromQueue(socketId: string) {
    const index = this.queue.findIndex(entry => entry.socketId === socketId);
    if (index !== -1) {
      const removed = this.queue.splice(index, 1)[0];
      console.log(`Player ${removed.name} left queue. Queue size: ${this.queue.length}`);
      
      // Update queue positions for remaining players
      this.updateQueuePositions();
    }
  }

  private updateQueuePositions() {
    this.queue.forEach((entry, index) => {
      entry.socket.emit("action", actionFromServer(LobbyAction.updateQueueState({ 
        inQueue: true, 
        queuePosition: index + 1,
        name: entry.name 
      })));
    });
  }

  private checkAndStartGame() {
    if (this.queue.length >= GameMinPlayers) {
      // Take up to GameMaxPlayers from the queue
      const playersToStart = Math.min(this.queue.length, GameMaxPlayers);
      const playersForGame = this.queue.splice(0, playersToStart);
      
      console.log(`Starting game with ${playersForGame.length} players`);
      
      // Create a new lobby/game
      const roomID = this.idManager.generateCode();
      const room = new Lobby(roomID);
      
      this.rooms.set(roomID, room);
      
      // Add all players to the room
      playersForGame.forEach(({ socket, name, socketId }) => {
        socket.join(roomID);
        room.onJoin(name, socket, this.io);
        // Update socket mapping in server
        this.sockets.set(socketId, roomID);
      });
      
      // Update queue positions for remaining players
      this.updateQueuePositions();
      
      // Auto-start the game
      setTimeout(() => {
        this.startGame(roomID);
      }, 2000); // Give players 2 seconds to see they're in a game
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
    room.game = new Game(gameOptions, roomID);

    // Get everyone to join game
    const hydrateGameStateAction = GameAction.hydrate(
      room.game.store.getState()
    );
    this.io.to(roomID).emit("action", actionFromServer(hydrateGameStateAction));

    const updateGameStateAction = LobbyAction.updateGameState({
      inGame: true,
    });
    room.store.dispatch(updateGameStateAction);
    this.io.to(roomID).emit("action", actionFromServer(updateGameStateAction));

    // Start game
    console.log("Game start:", roomID);
    room.game.start(this.io);
  }

  getQueueSize(): number {
    return this.queue.length;
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
