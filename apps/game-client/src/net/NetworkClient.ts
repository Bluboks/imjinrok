import type {
  CommandEnvelope,
  CreateLobbyRequest,
  MatchmakingJoinRequest,
  SessionSummary,
} from "@shared";
import type { WorldSnapshot } from "@simulation";

interface MatchmakingResponse {
  session: SessionSummary | null;
}

interface CreateLobbyResponse {
  id: string;
}

interface StartLobbyResponse {
  session: SessionSummary;
}

interface CommandErrorResponse {
  message?: string;
  reason?: string;
}

export type RemoteCommandIssueResult =
  | { ok: true; command: CommandEnvelope }
  | { ok: false; reason: string };

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

  async getSessionSnapshot(sessionId: string): Promise<WorldSnapshot> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}/snapshot`);

    if (!response.ok) {
      throw new Error(`Failed to fetch session snapshot: ${response.status}`);
    }

    return (await response.json()) as WorldSnapshot;
  }

  async issueCommand(envelope: CommandEnvelope): Promise<RemoteCommandIssueResult> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${envelope.sessionId}/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(envelope),
    });

    if (response.status === 400 || response.status === 404) {
      return { ok: false, reason: await readCommandIssueError(response) };
    }

    if (!response.ok) {
      throw new Error(`Failed to issue command: ${response.status}`);
    }

    return { ok: true, command: (await response.json()) as CommandEnvelope };
  }
}

async function readCommandIssueError(response: Response): Promise<string> {
  try {
    const error = (await response.json()) as CommandErrorResponse;

    return error.reason ?? error.message ?? `Command rejected with status ${response.status}`;
  } catch {
    return `Command rejected with status ${response.status}`;
  }
}
