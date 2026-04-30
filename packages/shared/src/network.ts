import type { CommandEnvelope } from "./commands.js";

export const gameModes = ["singleplayer", "custom-lobby", "matchmaking"] as const;
export type GameMode = (typeof gameModes)[number];

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
  mode: GameMode;
  mapId: string;
  playerIds: string[];
  tickRate: number;
}

export interface SessionSnapshotResponse {
  sessionId: string;
  tick: number;
}

export interface SocketEnvelope {
  type: "command:issue" | "session:join";
  payload: CommandEnvelope | { sessionId: string };
}
