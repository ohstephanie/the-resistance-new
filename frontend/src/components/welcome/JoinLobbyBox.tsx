import { LobbyAction } from "common-modules";
import React from "react";
import Button from "react-bootstrap/esm/Button";
import { useDispatch } from "react-redux";
import s from "./JoinLobbyBox.module.scss";

type JoinLobbyBoxProps = {
  initialRoomCode: string | null;
};

export default function JoinLobbyBox(props: JoinLobbyBoxProps) {
  const dispatch = useDispatch();

  const handleJoinQueue = () => {
    dispatch(LobbyAction.clientJoinQueue());
  };

  return (
    <div className={s.JoinLobbyBox}>
      <div className={s.queueInfo}>
        <h3>Join the Queue</h3>
        <p>You'll be automatically matched with other players when enough people join!</p>
        <p>You'll receive a random animal name when you join.</p>
      </div>
      <Button 
        onClick={handleJoinQueue}
        size="lg"
        variant="primary"
        className={s.joinButton}
      >
        Join Queue
      </Button>
    </div>
  );
}
