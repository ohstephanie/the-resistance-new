import { LobbyAction } from "common-modules";
import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/esm/Button";
import Form from "react-bootstrap/esm/Form";
import { useDispatch } from "react-redux";
import s from "./JoinLobbyBox.module.scss";

type JoinLobbyBoxProps = {
  initialRoomCode: string | null;
};

type Difficulty = "easy" | "medium" | "hard";

export default function JoinLobbyBox(props: JoinLobbyBoxProps) {
  const dispatch = useDispatch();
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [researchMode, setResearchMode] = useState(false);

  useEffect(() => {
    // Check research mode status
    fetch("/api/research-mode")
      .then((res) => res.json())
      .then((data) => {
        setResearchMode(data.researchMode || false);
        // If research mode is on, default to "easy" difficulty
        if (data.researchMode) {
          setSelectedDifficulty("easy");
        }
      })
      .catch((err) => console.error("Failed to fetch research mode:", err));

    // Poll research mode every 5 seconds
    const interval = setInterval(() => {
      fetch("/api/research-mode")
        .then((res) => res.json())
        .then((data) => {
          setResearchMode(data.researchMode || false);
          if (data.researchMode && !selectedDifficulty) {
            setSelectedDifficulty("easy");
          }
        })
        .catch((err) => console.error("Failed to fetch research mode:", err));
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedDifficulty]);

  const handleJoinQueue = () => {
    // In research mode, use "easy" as default
    const difficulty = researchMode ? "easy" : selectedDifficulty;
    if (difficulty) {
      dispatch(LobbyAction.clientJoinQueue({ difficulty }));
    }
  };

  return (
    <div className={s.JoinLobbyBox}>
      <div className={s.queueInfo}>
        <h3>Join the Queue</h3>
        <p>You'll be automatically matched with other players when enough people join!</p>
        <p>You'll receive a random animal name when you join.</p>
      </div>
      {researchMode ? (
        // Research mode: single button, no difficulty selection
        <Button 
          onClick={handleJoinQueue}
          size="lg"
          variant="primary"
          className={s.joinButton}
        >
          Join Queue
        </Button>
      ) : (
        // Normal mode: show difficulty selection
        <>
          <Form.Group className="mb-3">
            <Form.Label>Select Difficulty</Form.Label>
            <Form.Control
              as="select"
              value={selectedDifficulty || ""}
              onChange={(e) => setSelectedDifficulty(e.target.value as Difficulty | null)}
            >
              <option value="">Choose a difficulty...</option>
              <option value="easy">🟢 Easy (5 players)</option>
              <option value="medium">🟡 Medium (7 players)</option>
              <option value="hard">🔴 Hard (9 players)</option>
            </Form.Control>
          </Form.Group>
          <Button 
            onClick={handleJoinQueue}
            size="lg"
            variant="primary"
            className={s.joinButton}
            disabled={!selectedDifficulty}
          >
            Join Queue
          </Button>
        </>
      )}
    </div>
  );
}
