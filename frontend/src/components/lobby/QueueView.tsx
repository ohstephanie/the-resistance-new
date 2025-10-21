import React from "react";
import { useSelector, useDispatch } from "react-redux";
import { LobbyAction } from "common-modules";
import { LobbySelector } from "../../store";
import Button from "react-bootstrap/esm/Button";
import s from "./QueueView.module.scss";

export default function QueueView() {
  const dispatch = useDispatch();
  const inQueue = useSelector(LobbySelector.inQueue);
  const queuePosition = useSelector(LobbySelector.queuePosition);
  const playerName = useSelector(LobbySelector.playerName);

  const handleLeaveQueue = () => {
    dispatch(LobbyAction.clientLeaveQueue());
  };

  if (!inQueue) {
    return null;
  }

  return (
    <div className={s.QueueView}>
      <div className={s.queueInfo}>
        <h3>You're in the Queue!</h3>
        <p>Your name: <strong>{playerName}</strong></p>
        <p>Position in queue: <strong>{queuePosition}</strong></p>
        <p>Waiting for more players to join...</p>
      </div>
      <Button 
        onClick={handleLeaveQueue}
        variant="outline-danger"
        className={s.leaveButton}
      >
        Leave Queue
      </Button>
    </div>
  );
}

