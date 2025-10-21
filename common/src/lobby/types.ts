import { GameCustomRoleOptions, GameMode } from "../game";

export type LobbyState = {
  id: string;
  // member[0] is host
  memberIDs: string[];
  names: string[];
  gameInitOptions: GameMode | GameCustomRoleOptions;
  inGame: boolean;
  inQueue: boolean;
  queuePosition: number;
  playerName: string;
};
