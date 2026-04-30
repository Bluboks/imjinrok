import type {
  CommandEnvelope,
  GameMode,
  MapDefinition,
  SessionSummary,
} from "../../../../packages/shared/src/index.js";
import {
  advanceWorldTick,
  applyCommand,
  createInitialWorldState,
  type WorldState,
} from "../../../../packages/simulation/src/index.js";
import { nanoid } from "nanoid";

interface CreateSessionOptions {
  mode: GameMode;
  map: MapDefinition;
  playerIds: string[];
}

interface ActiveSession {
  summary: SessionSummary;
  worldState: WorldState;
  loop: ReturnType<typeof setInterval>;
}

export class GameSessionService {
  private readonly sessions = new Map<string, ActiveSession>();

  constructor(private readonly tickRate: number) {}

  createSession(options: CreateSessionOptions): SessionSummary {
    const summary: SessionSummary = {
      id: nanoid(12),
      mode: options.mode,
      mapId: options.map.id,
      playerIds: options.playerIds,
      tickRate: this.tickRate,
    };

    const worldState = createInitialWorldState(options.map, options.playerIds);
    const loop = setInterval(() => {
      advanceWorldTick(worldState);
    }, 1000 / this.tickRate);

    this.sessions.set(summary.id, {
      summary,
      worldState,
      loop,
    });

    return summary;
  }

  listSessions(): SessionSummary[] {
    return Array.from(this.sessions.values()).map((session) => session.summary);
  }

  issueCommand(envelope: CommandEnvelope): CommandEnvelope | null {
    const session = this.sessions.get(envelope.sessionId);

    if (!session) {
      return null;
    }

    applyCommand(session.worldState, envelope);
    return envelope;
  }

  getSnapshot(sessionId: string): WorldState | null {
    const session = this.sessions.get(sessionId);

    return session ? structuredClone(session.worldState) : null;
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      clearInterval(session.loop);
    }
  }
}
