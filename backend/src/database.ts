import Database from "better-sqlite3";
import path from "path";
import { GameState, GameAction, ChatMessage, Team, Mission } from "common-modules";
import { AnyAction } from "@reduxjs/toolkit";

export interface GameRecord {
  id: number;
  room_id: string;
  game_mode: string;
  difficulty: string | null;
  num_players: number;
  player_names: string; // JSON array
  player_roles: string; // JSON array
  player_is_ai: string; // JSON array of booleans
  player_participant_codes: string; // JSON array of participant codes (null for AI players)
  winner: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface GameActionRecord {
  id: number;
  game_id: number;
  action_type: string;
  action_payload: string; // JSON
  player_index: number | null;
  participant_code: string | null;
  timestamp: string;
  game_phase: string;
  mission_number: number;
}

export interface ChatMessageRecord {
  id: number;
  game_id: number;
  message_type: string; // 'player' or 'system'
  player_index: number | null;
  participant_code: string | null;
  content: string;
  timestamp: string;
}

export interface TeamRecord {
  id: number;
  game_id: number;
  mission_number: number;
  leader_index: number;
  members: string; // JSON array of indices
  votes: string; // JSON array of votes
  approved: boolean;
  timestamp: string;
}

export interface MissionRecord {
  id: number;
  game_id: number;
  mission_number: number;
  members: string; // JSON array of indices
  actions: string; // JSON array of actions
  result: string | null; // 'success' or 'fail'
  timestamp: string;
}

export class GameDatabase {
  private db: Database.Database;
  private currentGameId: Map<string, number>; // roomID -> game_id

  constructor(dbPath?: string) {
    const finalPath = dbPath || path.join(__dirname, "../../data/games.db");
    
    // Ensure directory exists
    const fs = require("fs");
    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(finalPath);
    this.currentGameId = new Map();
    this.initializeSchema();
    console.log(`Database initialized at: ${finalPath}`);
  }

  private initializeSchema() {
    // Games table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL UNIQUE,
        game_mode TEXT NOT NULL,
        difficulty TEXT,
        num_players INTEGER NOT NULL,
        player_names TEXT NOT NULL,
        player_roles TEXT NOT NULL,
        player_is_ai TEXT NOT NULL,
        player_participant_codes TEXT,
        winner TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migration: Add player_is_ai column if it doesn't exist (for existing databases)
    try {
      this.db.exec(`ALTER TABLE games ADD COLUMN player_is_ai TEXT DEFAULT '[]'`);
    } catch (e) {
      // Column already exists, ignore
    }
    
    // Migration: Add player_participant_codes column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE games ADD COLUMN player_participant_codes TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Game actions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS game_actions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        action_payload TEXT,
        player_index INTEGER,
        participant_code TEXT,
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        game_phase TEXT,
        mission_number INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `);
    
    // Migration: Add participant_code column to game_actions if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE game_actions ADD COLUMN participant_code TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Chat messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        message_type TEXT NOT NULL,
        player_index INTEGER,
        participant_code TEXT,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `);
    
    // Migration: Add participant_code column to chat_messages if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE chat_messages ADD COLUMN participant_code TEXT`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Teams table (proposals and votes)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        mission_number INTEGER NOT NULL,
        leader_index INTEGER NOT NULL,
        members TEXT NOT NULL,
        votes TEXT NOT NULL,
        approved BOOLEAN NOT NULL,
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `);

    // Missions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        mission_number INTEGER NOT NULL,
        members TEXT NOT NULL,
        actions TEXT NOT NULL,
        result TEXT,
        timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      )
    `);

    // Create indexes for better query performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);
      CREATE INDEX IF NOT EXISTS idx_game_actions_timestamp ON game_actions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_game_id ON chat_messages(game_id);
      CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_teams_game_id ON teams(game_id);
      CREATE INDEX IF NOT EXISTS idx_missions_game_id ON missions(game_id);
    `);
  }

  startGame(
    roomID: string,
    gameMode: string,
    difficulty: string | null,
    playerNames: string[],
    playerRoles: string[],
    playerIsAI: boolean[] = [],
    playerParticipantCodes: (string | null)[] = []
  ): number {
    // If playerIsAI is not provided, create array of false values
    const isAIArray = playerIsAI.length === playerNames.length 
      ? playerIsAI 
      : new Array(playerNames.length).fill(false);
    
    // If playerParticipantCodes is not provided, create array of null values
    const participantCodesArray = playerParticipantCodes.length === playerNames.length
      ? playerParticipantCodes
      : new Array(playerNames.length).fill(null);
    
    const stmt = this.db.prepare(`
      INSERT INTO games (room_id, game_mode, difficulty, num_players, player_names, player_roles, player_is_ai, player_participant_codes, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(
      roomID,
      gameMode,
      difficulty,
      playerNames.length,
      JSON.stringify(playerNames),
      JSON.stringify(playerRoles),
      JSON.stringify(isAIArray),
      JSON.stringify(participantCodesArray)
    );

    const gameId = result.lastInsertRowid as number;
    this.currentGameId.set(roomID, gameId);
    console.log(`[Database] Started game ${gameId} (room: ${roomID})`);
    return gameId;
  }

  endGame(roomID: string, winner: string | null) {
    const gameId = this.currentGameId.get(roomID);
    if (!gameId) {
      console.warn(`[Database] No game found for room ${roomID}`);
      return;
    }

    const stmt = this.db.prepare(`
      UPDATE games 
      SET winner = ?, ended_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(winner, gameId);
    this.currentGameId.delete(roomID);
    console.log(`[Database] Ended game ${gameId} (room: ${roomID}), winner: ${winner || "none"}`);
  }

  saveAction(
    roomID: string,
    action: AnyAction,
    gameState: GameState,
    participantCode: string | null = null
  ) {
    const gameId = this.currentGameId.get(roomID);
    if (!gameId) return;

    // Extract player index from action if available
    let playerIndex: number | null = null;
    if (action.payload) {
      if (typeof action.payload === "object" && "player" in action.payload) {
        playerIndex = action.payload.player as number;
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO game_actions (game_id, action_type, action_payload, player_index, participant_code, game_phase, mission_number)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      gameId,
      action.type,
      JSON.stringify(action.payload || {}),
      playerIndex,
      participantCode,
      gameState.game.phase,
      gameState.game.mission
    );
  }

  saveChatMessage(roomID: string, message: ChatMessage, participantCode: string | null = null) {
    const gameId = this.currentGameId.get(roomID);
    if (!gameId) return;

    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (game_id, message_type, player_index, participant_code, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    if (message.type === "player") {
      stmt.run(gameId, "player", message.player, participantCode, message.content);
    } else {
      stmt.run(gameId, "system", null, null, message.content);
    }
  }

  saveTeam(roomID: string, team: Team, approved: boolean) {
    const gameId = this.currentGameId.get(roomID);
    if (!gameId) return;

    const stmt = this.db.prepare(`
      INSERT INTO teams (game_id, mission_number, leader_index, members, votes, approved)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      gameId,
      team.mission,
      team.leader,
      JSON.stringify(team.members),
      JSON.stringify(team.votes),
      approved ? 1 : 0
    );
  }

  saveMission(roomID: string, mission: Mission, result: "success" | "fail" | null) {
    const gameId = this.currentGameId.get(roomID);
    if (!gameId) return;

    const stmt = this.db.prepare(`
      INSERT INTO missions (game_id, mission_number, members, actions, result)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(
      gameId,
      mission.mission,
      JSON.stringify(mission.members),
      JSON.stringify(mission.actions),
      result
    );
  }

  // Query methods
  getAllGames(limit: number = 100, offset: number = 0): GameRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM games 
      ORDER BY started_at DESC 
      LIMIT ? OFFSET ?
    `);
    return stmt.all(limit, offset) as GameRecord[];
  }

  getGameById(gameId: number): GameRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM games WHERE id = ?`);
    const result = stmt.get(gameId) as GameRecord | undefined;
    return result || null;
  }

  getGameByRoomId(roomID: string): GameRecord | null {
    const stmt = this.db.prepare(`SELECT * FROM games WHERE room_id = ?`);
    const result = stmt.get(roomID) as GameRecord | undefined;
    return result || null;
  }

  getGameActions(gameId: number): GameActionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM game_actions 
      WHERE game_id = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(gameId) as GameActionRecord[];
  }

  getChatMessages(gameId: number): ChatMessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM chat_messages 
      WHERE game_id = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(gameId) as ChatMessageRecord[];
  }

  getTeams(gameId: number): TeamRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM teams 
      WHERE game_id = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(gameId) as TeamRecord[];
  }

  getMissions(gameId: number): MissionRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM missions 
      WHERE game_id = ? 
      ORDER BY timestamp ASC
    `);
    return stmt.all(gameId) as MissionRecord[];
  }

  getFullGameData(gameId: number) {
    const game = this.getGameById(gameId);
    if (!game) return null;

    return {
      game,
      actions: this.getGameActions(gameId),
      chat: this.getChatMessages(gameId),
      teams: this.getTeams(gameId),
      missions: this.getMissions(gameId),
    };
  }

  getGameStats() {
    const totalGames = this.db.prepare(`SELECT COUNT(*) as count FROM games`).get() as { count: number };
    const finishedGames = this.db.prepare(`SELECT COUNT(*) as count FROM games WHERE ended_at IS NOT NULL`).get() as { count: number };
    const byDifficulty = this.db.prepare(`
      SELECT difficulty, COUNT(*) as count 
      FROM games 
      WHERE difficulty IS NOT NULL
      GROUP BY difficulty
    `).all() as Array<{ difficulty: string; count: number }>;

    return {
      totalGames: totalGames.count,
      finishedGames: finishedGames.count,
      byDifficulty,
    };
  }

  close() {
    this.db.close();
  }
}


