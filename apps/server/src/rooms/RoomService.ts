import { nanoid } from "nanoid";
import type {
  CreateLobbyRequest,
  LobbyRecord,
  LobbySummary,
} from "../shared.js";

export class RoomService {
  private readonly lobbies = new Map<string, LobbyRecord>();

  createLobby(request: CreateLobbyRequest): LobbyRecord {
    const lobby: LobbyRecord = {
      id: nanoid(12),
      inviteCode: nanoid(8).toUpperCase(),
      config: request,
      playerIds: [request.hostPlayerId],
      status: "waiting",
      createdAt: Date.now(),
    };

    this.lobbies.set(lobby.id, lobby);
    return lobby;
  }

  joinLobby(lobbyId: string, playerId: string): LobbyRecord | null {
    const lobby = this.lobbies.get(lobbyId);

    if (!lobby || lobby.status !== "waiting") {
      return null;
    }

    if (lobby.playerIds.includes(playerId)) {
      return lobby;
    }

    if (lobby.playerIds.length >= lobby.config.maxPlayers) {
      return null;
    }

    lobby.playerIds.push(playerId);
    return lobby;
  }

  startLobby(lobbyId: string): LobbyRecord | null {
    const lobby = this.lobbies.get(lobbyId);

    if (!lobby) {
      return null;
    }

    lobby.status = "running";
    return lobby;
  }

  listOpenLobbies(): LobbySummary[] {
    return Array.from(this.lobbies.values()).map((lobby) => ({
      id: lobby.id,
      inviteCode: lobby.inviteCode,
      name: lobby.config.name,
      visibility: lobby.config.visibility,
      maxPlayers: lobby.config.maxPlayers,
      seatsTaken: lobby.playerIds.length,
      mapId: lobby.config.mapId,
      status: lobby.status,
    }));
  }
}
