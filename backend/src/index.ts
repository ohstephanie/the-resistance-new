import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import process from "process";
import socketIO from "socket.io";
import { Server } from "./server";

const app = express();

const httpServer = http.createServer(app);

const io = new socketIO.Server(httpServer);
const server = new Server(io);
// Make server accessible from io for AI agent routing
(io as any).serverInstance = server;

const port = process.env.PORT ?? 8080;
httpServer.listen(port, () => {
  console.log("Starting HTTP server on port " + port);
});
httpServer.addListener("close", () => {
  console.log("HTTP server closed");
});

app.get("/api/statistics", (req, res) => {
  const players = server.sockets.size;
  const queueSize = server.queueManager.getQueueSize();
  const lobbies = server.queueManager.getTotalRooms();
  const games = server.queueManager.getActiveGames();
  return res.json({
    players,
    queueSize,
    lobbies,
    games,
  });
});

// API endpoint to create an AI agent
app.post("/api/create-ai-agent", async (req, res) => {
  try {
    const aiSocket = await server.createAIAgent();
    if (aiSocket) {
      res.json({ 
        success: true, 
        socketId: aiSocket.id,
        message: "AI agent created and added to queue"
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: "Failed to create AI agent. Make sure USE_LLM_AGENTS=true and Azure credentials are configured." 
      });
    }
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      error: error.message || "Unknown error creating AI agent" 
    });
  }
});

// API endpoint to get LLM agent statistics
app.get("/api/llm-stats", (req, res) => {
  try {
    const stats = server.getLLMAgentStats();
    const report = server.getModelComparisonReport();
    
    if (!stats) {
      return res.json({
        enabled: false,
        message: "LLM agents are not enabled. Set USE_LLM_AGENTS=true to enable."
      });
    }
    
    res.json({
      enabled: true,
      stats,
      modelComparison: report
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message || "Unknown error getting LLM stats" 
    });
  }
});

// API endpoint to get detailed agent information
app.get("/api/ai-agents", (req, res) => {
  try {
    const stats = server.getLLMAgentStats();
    
    if (!stats) {
      return res.json({
        enabled: false,
        agents: []
      });
    }
    
    res.json({
      enabled: true,
      totalAgents: stats.totalAgents,
      agents: stats.agents.map(agent => ({
        name: agent.name,
        role: agent.role,
        model: agent.model,
        totalActions: agent.stats.player.totalActions,
        totalCost: agent.stats.player.totalCost,
        totalTokens: agent.stats.player.totalTokens
      }))
    });
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message || "Unknown error getting AI agents" 
    });
  }
});

// Database API endpoints
app.get("/api/games", (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const games = server.database.getAllGames(limit, offset);
    res.json(games);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error getting games" });
  }
});

app.get("/api/games/:gameId", (req, res) => {
  try {
    const gameId = parseInt(req.params.gameId);
    if (isNaN(gameId)) {
      return res.status(400).json({ error: "Invalid game ID" });
    }
    const gameData = server.database.getFullGameData(gameId);
    if (!gameData) {
      return res.status(404).json({ error: "Game not found" });
    }
    res.json(gameData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error getting game data" });
  }
});

app.get("/api/games/room/:roomId", (req, res) => {
  try {
    const roomId = req.params.roomId;
    const game = server.database.getGameByRoomId(roomId);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }
    const gameData = server.database.getFullGameData(game.id);
    res.json(gameData);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error getting game data" });
  }
});

app.get("/api/database/stats", (req, res) => {
  try {
    const stats = server.database.getGameStats();
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error getting database stats" });
  }
});

// Admin API endpoints
app.use(express.json());

// Public endpoint to check research mode (for frontend)
app.get("/api/research-mode", (req, res) => {
  res.json({ researchMode: server.isResearchMode() });
});

// Admin authentication
app.post("/api/admin/login", (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: "Password required" });
    }
    
    if (server.verifyAdminPassword(password)) {
      const sessionToken = server.createAdminSession();
      res.json({ success: true, sessionToken });
    } else {
      res.status(401).json({ error: "Invalid password" });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Middleware to verify admin session
const verifyAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const sessionToken = req.headers.authorization?.replace("Bearer ", "");
  if (!sessionToken || !server.verifyAdminSession(sessionToken)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Get research mode status
app.get("/api/admin/research-mode", verifyAdmin, (req, res) => {
  res.json({ researchMode: server.isResearchMode() });
});

// Toggle research mode
app.post("/api/admin/research-mode", verifyAdmin, (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }
    server.setResearchMode(enabled);
    res.json({ success: true, researchMode: enabled });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Get queue players
app.get("/api/admin/queue", verifyAdmin, (req, res) => {
  try {
    const players = server.getQueuePlayers();
    res.json({ players });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Get active games
app.get("/api/admin/games", verifyAdmin, (req, res) => {
  try {
    const games = server.getActiveGames();
    res.json({ games });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Create game manually
app.post("/api/admin/create-game", verifyAdmin, async (req, res) => {
  try {
    const { playerSocketIds, difficulty, numEvilAI } = req.body;
    
    if (!Array.isArray(playerSocketIds) || playerSocketIds.length === 0) {
      return res.status(400).json({ error: "playerSocketIds must be a non-empty array" });
    }
    
    if (difficulty !== "easy") {
      return res.status(400).json({ error: "Only 'easy' difficulty games can be created from the admin panel" });
    }
    
    if (typeof numEvilAI !== "number" || numEvilAI < 0) {
      return res.status(400).json({ error: "numEvilAI must be a non-negative number" });
    }
    
    const roomId = await server.createGameManually(playerSocketIds, difficulty, numEvilAI);
    
    if (!roomId) {
      return res.status(400).json({ error: "Failed to create game" });
    }
    
    res.json({ success: true, roomId });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Remove player from queue
app.post("/api/admin/remove-player", verifyAdmin, (req, res) => {
  try {
    const { socketId } = req.body;
    if (!socketId) {
      return res.status(400).json({ error: "socketId required" });
    }
    
    server.queueManager.removePlayersFromQueue([socketId]);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Get participant codes
app.get("/api/admin/participant-codes", verifyAdmin, (req, res) => {
  try {
    const codes = server.getParticipantCodes();
    res.json({ codes });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Add participant code
app.post("/api/admin/participant-codes", verifyAdmin, (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code must be a non-empty string" });
    }
    server.addParticipantCode(code.trim());
    res.json({ success: true, codes: server.getParticipantCodes() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

// Remove participant code
app.delete("/api/admin/participant-codes", verifyAdmin, (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code must be a non-empty string" });
    }
    server.removeParticipantCode(code.trim());
    res.json({ success: true, codes: server.getParticipantCodes() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});

app.use(express.static(path.join(__dirname, "../../frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../frontend/build/index.html"));
});

// Handle SIGINT and SIGTERM
const handler = () => {
  httpServer.close();
  io.close();
};
process.on("SIGINT", handler);
process.on("SIGTERM", handler);
