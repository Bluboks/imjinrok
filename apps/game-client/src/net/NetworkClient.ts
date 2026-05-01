import type {
  CreateLobbyRequest,
  MatchmakingJoinRequest,
  SessionSummary,
} from "@shared";

interface MatchmakingResponse {
  session: SessionSummary | null;
}

interface CreateLobbyResponse {
  id: string;
}

interface StartLobbyResponse {
  session: SessionSummary;
}

export class NetworkClient {
  constructor(private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5174") {}

  async createCustomLobby(playerId: string): Promise<{ session: SessionSummary | null; serverOnline: boolean }> {
    const payload: CreateLobbyRequest = {
      hostPlayerId: playerId,
      name: "Founders Lobby",
      visibility: "private",
      maxPlayers: 4,
      mapId: "river-crossing",
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/lobbies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to create lobby: ${response.status}`);
      }

      const lobby = (await response.json()) as CreateLobbyResponse;

      const startResponse = await fetch(`${this.baseUrl}/api/lobbies/${lobby.id}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!startResponse.ok) {
        throw new Error(`Failed to start lobby: ${startResponse.status}`);
      }

      const startedLobby = (await startResponse.json()) as StartLobbyResponse;

      return {
        session: startedLobby.session,
        serverOnline: true,
      };
    } catch {
      return {
        session: {
          id: "offline-custom-preview",
          entryMode: "custom-lobby",
          connectionMode: "local",
          scenarioType: "skirmish",
          mapId: payload.mapId,
          playerIds: [playerId],
          tickRate: 10,
        },
        serverOnline: false,
      };
    }
  }

  async joinAutomatch(playerId: string, rating = 1200): Promise<{ session: SessionSummary | null; serverOnline: boolean }> {
    const payload: MatchmakingJoinRequest = {
      playerId,
      rating,
      region: "kr-dev",
    };

    try {
      const response = await fetch(`${this.baseUrl}/api/matchmaking/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Failed to queue matchmaking: ${response.status}`);
      }

      const result = (await response.json()) as MatchmakingResponse;

      return {
        session: result.session,
        serverOnline: true,
      };
    } catch {
      return {
        session: null,
        serverOnline: false,
      };
    }
  }
}
