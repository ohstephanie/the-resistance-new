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
