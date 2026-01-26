import { LobbyAction } from "common-modules";
import React, { useState, useEffect } from "react";
import Button from "react-bootstrap/esm/Button";
import Form from "react-bootstrap/esm/Form";
import { useDispatch, useSelector } from "react-redux";
import { LobbySelector } from "../../store";
import s from "./JoinLobbyBox.module.scss";

type JoinLobbyBoxProps = {
  initialRoomCode: string | null;
};

type Difficulty = "easy" | "medium" | "hard";

export default function JoinLobbyBox(props: JoinLobbyBoxProps) {
  const dispatch = useDispatch();
  const queueError = useSelector(LobbySelector.queueError);
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null);
  const [researchMode, setResearchMode] = useState(false);
  const [participantCode, setParticipantCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  
  // Update local error state when queue error changes
  useEffect(() => {
    if (queueError) {
      setCodeError(queueError);
    }
  }, [queueError]);

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
    // In research mode, use "easy" as default and require participant code
    const difficulty = researchMode ? "easy" : selectedDifficulty;
    if (difficulty) {
      if (researchMode && !participantCode.trim()) {
        setCodeError("Participant code is required in research mode");
        return;
      }
      setCodeError(null);
      dispatch(LobbyAction.clientJoinQueue({ 
        difficulty, 
        participantCode: researchMode ? participantCode.trim() : undefined 
      }));
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
        // Research mode: participant code input and single button
        <>
          <Form.Group className="mb-3">
            <Form.Label>Participant Code</Form.Label>
            <Form.Control
              type="text"
              value={participantCode}
              onChange={(e) => {
                setParticipantCode(e.target.value);
                setCodeError(null);
              }}
              placeholder="Enter your participant code"
              isInvalid={!!codeError}
            />
            {(codeError || queueError) && (
              <Form.Control.Feedback type="invalid">
                {codeError || queueError}
              </Form.Control.Feedback>
            )}
            <Form.Text className="text-muted">
              A participant code is required to join the queue in research mode.
            </Form.Text>
          </Form.Group>
          <Button 
            onClick={handleJoinQueue}
            size="lg"
            variant="primary"
            className={s.joinButton}
            disabled={!participantCode.trim()}
          >
            Join Queue
          </Button>
        </>
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
