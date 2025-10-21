import { AnyAction } from "@reduxjs/toolkit";
import { LobbyAction } from "common-modules";
import socketIO, { Socket } from "socket.io";
import { Lobby } from "./lobby";
import { QueueManager } from "./queue";
import { actionFromServer, RoomCodeManager } from "./util";

export class Server {
  io: socketIO.Server;
  sockets: Map<string, string | null>;
  idManager: RoomCodeManager;
  queueManager: QueueManager;
  constructor(io: socketIO.Server) {
    this.io = io;
    this.io.on("connection", this.onConnection.bind(this));
    this.sockets = new Map();
    this.idManager = new RoomCodeManager();
    this.queueManager = new QueueManager(io, this.sockets);
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
      // Add to queue
      this.queueManager.addToQueue(socket);
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
    }
  }
}
