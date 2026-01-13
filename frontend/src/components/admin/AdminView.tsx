import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Card from "react-bootstrap/Card";
import ListGroup from "react-bootstrap/ListGroup";
import Badge from "react-bootstrap/Badge";
import ToggleButton from "react-bootstrap/ToggleButton";
import ToggleButtonGroup from "react-bootstrap/ToggleButtonGroup";
import s from "./AdminView.module.scss";

interface QueuePlayer {
  socketId: string;
  name: string;
  difficulty: string;
  isAI: boolean;
}

interface ActiveGame {
  roomId: string;
  difficulty: string | null;
  numPlayers: number;
  aiCount: number;
  status: string;
  gameCode: string;
}

export default function AdminView() {
  const navigate = useNavigate();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [researchMode, setResearchMode] = useState(false);
  const [queuePlayers, setQueuePlayers] = useState<QueuePlayer[]>([]);
  const [activeGames, setActiveGames] = useState<ActiveGame[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [gameDifficulty, setGameDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [numEvilAI, setNumEvilAI] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check if already authenticated
  useEffect(() => {
    const token = localStorage.getItem("adminSessionToken");
    if (token) {
      setSessionToken(token);
      setIsAuthenticated(true);
      fetchResearchMode(token);
      startPolling(token);
    }
  }, []);

  const fetchResearchMode = async (token: string) => {
    try {
      const response = await fetch("/api/admin/research-mode", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setResearchMode(data.researchMode);
      } else if (response.status === 401) {
        setIsAuthenticated(false);
        setSessionToken(null);
        localStorage.removeItem("adminSessionToken");
      }
    } catch (err) {
      console.error("Failed to fetch research mode:", err);
    }
  };

  const startPolling = (token: string) => {
    // Poll queue and games every 2 seconds
    const interval = setInterval(async () => {
      try {
        // Fetch queue players
        const queueResponse = await fetch("/api/admin/queue", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          setQueuePlayers(queueData.players || []);
        }

        // Fetch active games
        const gamesResponse = await fetch("/api/admin/games", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (gamesResponse.ok) {
          const gamesData = await gamesResponse.json();
          setActiveGames(gamesData.games || []);
        }
      } catch (err) {
        console.error("Failed to poll data:", err);
      }
    }, 2000);

    // Cleanup on unmount
    return () => clearInterval(interval);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        const data = await response.json();
        setSessionToken(data.sessionToken);
        setIsAuthenticated(true);
        localStorage.setItem("adminSessionToken", data.sessionToken);
        fetchResearchMode(data.sessionToken);
        startPolling(data.sessionToken);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Invalid password");
      }
    } catch (err) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleResearchMode = async (enabled: boolean) => {
    if (!sessionToken) return;

    try {
      const response = await fetch("/api/admin/research-mode", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setResearchMode(enabled);
      } else if (response.status === 401) {
        setError("Session expired. Please log in again.");
        setIsAuthenticated(false);
        setSessionToken(null);
        localStorage.removeItem("adminSessionToken");
      } else {
        console.error("Toggle research mode failed:", response.status, response.statusText);
        setError("Failed to toggle research mode");
      }
    } catch (err) {
      console.error("Toggle research mode error:", err);
      setError("Failed to toggle research mode");
    }
  };

  const handleCreateGame = async () => {
    if (!sessionToken || selectedPlayers.size === 0) {
      setError("Please select at least one player");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/create-game", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playerSocketIds: Array.from(selectedPlayers),
          difficulty: gameDifficulty,
          numEvilAI,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedPlayers(new Set());
        setError(null);
        alert(`Game created successfully! Room ID: ${data.roomId}`);
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to create game");
      }
    } catch (err) {
      setError("Failed to create game");
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = async (socketId: string) => {
    if (!sessionToken) return;

    try {
      const response = await fetch("/api/admin/remove-player", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ socketId }),
      });

      if (response.ok) {
        // Player will be removed from queue, polling will update the list
      } else {
        setError("Failed to remove player");
      }
    } catch (err) {
      setError("Failed to remove player");
    }
  };

  const togglePlayerSelection = (socketId: string) => {
    const newSelected = new Set(selectedPlayers);
    if (newSelected.has(socketId)) {
      newSelected.delete(socketId);
    } else {
      newSelected.add(socketId);
    }
    setSelectedPlayers(newSelected);
  };

  const humanPlayers = queuePlayers.filter((p) => !p.isAI);
  const requiredPlayers = gameDifficulty === "easy" ? 5 : gameDifficulty === "medium" ? 7 : 9;
  const maxEvilAI = gameDifficulty === "easy" ? 2 : gameDifficulty === "medium" ? 3 : 4;
  const totalSelected = selectedPlayers.size + numEvilAI;
  const remainingHumanSlots = requiredPlayers - totalSelected;

  if (!isAuthenticated) {
    return (
      <div className={s.AdminView}>
        <Card className={s.loginCard}>
          <Card.Body>
            <Card.Title>Admin Login</Card.Title>
            <Form onSubmit={handleLogin}>
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <Form.Control
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter admin password"
                />
              </Form.Group>
              {error && <div className="text-danger mb-3">{error}</div>}
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? "Logging in..." : "Login"}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className={s.AdminView}>
      <div className={s.header}>
        <h1>Admin Dashboard</h1>
        <Button variant="outline-secondary" onClick={() => navigate("/")}>
          Back to Game
        </Button>
      </div>

      {error && (
        <div className={`alert alert-danger ${s.alert}`} role="alert">
          {error}
        </div>
      )}

      <div className={s.grid}>
        {/* Research Mode Toggle */}
        <Card className={s.card}>
          <Card.Body>
            <Card.Title>Research Mode</Card.Title>
            <div className={s.toggleContainer}>
              <span>Research Mode: </span>
              <ToggleButtonGroup
                type="checkbox"
                value={researchMode ? [1] : []}
                onChange={(val) => handleToggleResearchMode(val.length > 0)}
              >
                <ToggleButton id="research-mode" value={1} variant={researchMode ? "success" : "outline-secondary"}>
                  {researchMode ? "ON" : "OFF"}
                </ToggleButton>
              </ToggleButtonGroup>
            </div>
            <p className={s.description}>
              When research mode is enabled, regular users will only see one queue button with no difficulty selection.
            </p>
          </Card.Body>
        </Card>

        {/* Queue Players */}
        <Card className={s.card}>
          <Card.Body>
            <Card.Title>
              Queue Players <Badge bg="secondary">{humanPlayers.length}</Badge>
            </Card.Title>
            <ListGroup variant="flush" className={s.playerList}>
              {humanPlayers.length === 0 ? (
                <ListGroup.Item>No players in queue</ListGroup.Item>
              ) : (
                humanPlayers.map((player) => (
                  <ListGroup.Item
                    key={player.socketId}
                    className={selectedPlayers.has(player.socketId) ? s.selected : ""}
                    onClick={() => togglePlayerSelection(player.socketId)}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={s.playerItem}>
                      <span>
                        <strong>{player.name}</strong>
                      </span>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePlayer(player.socketId);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </ListGroup.Item>
                ))
              )}
            </ListGroup>
          </Card.Body>
        </Card>

        {/* Create Game */}
        <Card className={s.card}>
          <Card.Body>
            <Card.Title>Create Game</Card.Title>
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Difficulty</Form.Label>
                <Form.Select
                  value={gameDifficulty}
                  onChange={(e) => setGameDifficulty(e.target.value as "easy" | "medium" | "hard")}
                >
                  <option value="easy">Easy (5 players)</option>
                  <option value="medium">Medium (7 players)</option>
                  <option value="hard">Hard (9 players)</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Number of Evil AI Players</Form.Label>
                <Form.Control
                  type="number"
                  min="0"
                  max={Math.min(maxEvilAI, requiredPlayers - selectedPlayers.size)}
                  value={numEvilAI}
                  onChange={(e) => setNumEvilAI(Math.min(parseInt(e.target.value) || 0, maxEvilAI))}
                />
                <Form.Text className="text-muted">
                  Selected: {selectedPlayers.size} human(s) | Evil AI: {numEvilAI} | Remaining human slots needed: {remainingHumanSlots} | Total:{" "}
                  {totalSelected} / {requiredPlayers}
                </Form.Text>
                {remainingHumanSlots !== 0 && (
                  <Form.Text className={remainingHumanSlots > 0 ? "text-warning" : "text-danger"} style={{ display: "block" }}>
                    {remainingHumanSlots > 0
                      ? `⚠️ Need ${remainingHumanSlots} more human player(s)`
                      : `❌ Too many players selected. Remove ${Math.abs(remainingHumanSlots)} player(s)`}
                  </Form.Text>
                )}
              </Form.Group>

              <Button
                variant="primary"
                onClick={handleCreateGame}
                disabled={loading || selectedPlayers.size === 0 || remainingHumanSlots !== 0}
              >
                {loading ? "Creating..." : "Create Game"}
              </Button>
            </Form>
          </Card.Body>
        </Card>

        {/* Active Games */}
        <Card className={s.card}>
          <Card.Body>
            <Card.Title>
              Active Games <Badge bg="primary">{activeGames.length}</Badge>
            </Card.Title>
            <ListGroup variant="flush">
              {activeGames.length === 0 ? (
                <ListGroup.Item>No active games</ListGroup.Item>
              ) : (
                activeGames.map((game) => (
                  <ListGroup.Item key={game.roomId}>
                    <div className={s.gameItem}>
                      <div>
                        <strong>Room: {game.gameCode}</strong>
                        <br />
                        Difficulty: {game.difficulty || "N/A"} | Players: {game.numPlayers} | AI: {game.aiCount} | Status:{" "}
                        {game.status}
                      </div>
                    </div>
                  </ListGroup.Item>
                ))
              )}
            </ListGroup>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
