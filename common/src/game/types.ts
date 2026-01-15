export type GameInitOptions = {
  socketIDs: string[];
  names: string[];
  seed: number;
  gamemode: GameMode | GameCustomRoleOptions;
};
export type GameCustomRoleOptions = {
  captain: boolean;
  deputy: boolean;
  assassin: boolean;
  imposter: boolean;
  intern: boolean;
  mole: boolean;
};
export type Color =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "pink";

export type GameMode = "normal" | "assassins" | "avalon_easy" | "avalon_medium" | "avalon_hard";
export type GamePhase =
  | "role-reveal"
  | "team-building"
  | "team-building-review"
  | "voting"
  | "voting-review"
  | "mission"
  | "mission-review"
  | "finished-assassinate"
  | "finished";

export type ChatMessage = PlayerChatMessage | SystemChatMessage;
export type PlayerChatMessage = {
  type: "player";
  player: number;
  content: string;
};
export type SystemChatMessage = {
  type: "system";
  content: string;
};

export type ProposalVote = "accept" | "reject" | "none";
export type MissionAction = "success" | "fail";
export type Team = {
  mission: number;
  leader: number;
  members: number[];
  votes: ProposalVote[];
};
export type Mission = {
  mission: number;
  members: number[];
  actions: (MissionAction | null)[];
};
export type Alligance = "agent" | "spy";
export type Role =
  | "agent"
  | "captain"
  | "deputy"
  | "spy"
  | "assassin"
  | "imposter"
  | "mole"
  | "intern"
  // Avalon roles
  | "merlin"
  | "percival"
  | "loyal_servant"
  | "morgana"
  | "mordred"
  | "oberon";
// --- Team Good ---
// Good knows noone
// Captain knows who evil are
// Deputy knows captain and impostor but doesn't know who's who
// --- Team Evil ---
// Evil know fellow evil (except intern)
// Assassin knows fellow evil (except intern), can kill one person at end of game
// Imposter knows fellow evil, appears as Captain to Deputy
// Mole is unknown to Captain
// Intern is unknown to other evil

export type SpeakingTurn = {
  currentSpeaker: number;
  timeRemaining: number; // in seconds (10 seconds per turn)
  turnOrder: number[]; // deterministic order of players
  turnIndex: number; // current index in turnOrder
};

export type GameState = {
  player: {
    names: string[];
    socketIDs: (string | null)[];
    roles: Role[];
  };
  assassinChoice: number | null;
  winner: Alligance | null;
  game: {
    phase: GamePhase;
    mission: number;
    phaseCountdown: number;
  };
  // Team only exists during team building and voting phases
  team: Team | null;
  teamHistory: Team[];
  // Mission only exists during mission phases
  mission: Mission | null;
  missionHistory: Mission[];
  chat: ChatMessage[];
  statusMessage: string | null;
  // Turn-based speaking system
  speakingTurn: SpeakingTurn | null;
};
