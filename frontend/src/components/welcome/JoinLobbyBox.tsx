import { LobbyAction } from "common-modules";
import React, { useState } from "react";
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

  const handleJoinQueue = () => {
    if (selectedDifficulty) {
      dispatch(LobbyAction.clientJoinQueue({ difficulty: selectedDifficulty }));
    }
  };

  return (
    <div className={s.JoinLobbyBox}>
      <div className={s.queueInfo}>
        <h3>Join the Queue</h3>
        <p>You'll be automatically matched with other players when enough people join!</p>
        <p>You'll receive a random animal name when you join.</p>
      </div>
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
    </div>
  );
}
