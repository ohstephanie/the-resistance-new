import { createSelector } from "@reduxjs/toolkit";
import { RootState } from "..";
import { ClientSelector } from "./client";
const { socketID } = ClientSelector;

const lobbyID = (state: RootState) => state.lobby.id;
const lobbyInGame = (state: RootState) => state.lobby.inGame;
const lobbyMembers = (state: RootState) => state.lobby.memberIDs;
const lobbyNames = (state: RootState) => state.lobby.names;
const lobbyGameOptions = (state: RootState) => state.lobby.gameInitOptions;
const inQueue = (state: RootState) => state.lobby.inQueue;
const queuePosition = (state: RootState) => state.lobby.queuePosition;
const playerName = (state: RootState) => state.lobby.playerName;
const queueError = (state: RootState) => state.lobby.queueError;

const lobbyIndex = createSelector(
  socketID,
  lobbyMembers,
  (socketID, lobbyMembers) => {
    const index = lobbyMembers.indexOf(socketID);
    return index === -1 ? null : index;
  }
);
const lobbyIsHost = createSelector(
  lobbyIndex,
  (lobbyIndex) => lobbyIndex === 0
);

export const LobbySelector = {
  lobbyID,
  lobbyInGame,
  lobbyMembers,
  lobbyNames,
  lobbyGameOptions,
  lobbyIndex,
  lobbyIsHost,
  inQueue,
  queuePosition,
  playerName,
  queueError,
};
