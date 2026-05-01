export const entryModes = ["singleplayer", "custom-lobby", "matchmaking"] as const;
export type EntryMode = (typeof entryModes)[number];

export const connectionModes = ["local", "hosted", "dedicated-server"] as const;
export type ConnectionMode = (typeof connectionModes)[number];

export const scenarioTypes = ["skirmish", "campaign", "custom-scenario"] as const;
export type ScenarioType = (typeof scenarioTypes)[number];

export interface CreateLobbyRequest {
  hostPlayerId: string;
  name: string;
  visibility: "private" | "friends" | "public";
  maxPlayers: number;
  mapId: string;
}

export interface JoinLobbyRequest {
  playerId: string;
}

export interface LobbyRecord {
  id: string;
  inviteCode: string;
  config: CreateLobbyRequest;
  playerIds: string[];
  status: "waiting" | "running";
  createdAt: number;
}

export interface LobbySummary {
  id: string;
  inviteCode: string;
  name: string;
  visibility: CreateLobbyRequest["visibility"];
  maxPlayers: number;
  seatsTaken: number;
  mapId: string;
  status: LobbyRecord["status"];
}

export interface MatchmakingJoinRequest {
  playerId: string;
  rating: number;
  region: string;
}

export interface MatchmakingTicket extends MatchmakingJoinRequest {
  queuedAt: number;
}

export interface SessionSummary {
  id: string;
  entryMode: EntryMode;
  connectionMode: ConnectionMode;
  scenarioType: ScenarioType;
  mapId: string;
  playerIds: string[];
  tickRate: number;
}
