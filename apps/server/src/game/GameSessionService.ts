import type {
  CommandEnvelope,
  ConnectionMode,
  EntryMode,
  MapDefinition,
  ScenarioDefinition,
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
  entryMode: EntryMode;
  connectionMode: ConnectionMode;
  scenario: ScenarioDefinition;
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
    if (options.map.id !== options.scenario.mapId) {
      throw new Error(`Scenario ${options.scenario.id} targets map ${options.scenario.mapId}, but received map ${options.map.id}.`);
    }

    const summary: SessionSummary = {
      id: nanoid(12),
      entryMode: options.entryMode,
      connectionMode: options.connectionMode,
      scenarioType: options.scenario.scenarioType,
      mapId: options.map.id,
      playerIds: options.playerIds,
      tickRate: this.tickRate,
    };

    const worldState = createInitialWorldState(options.map, options.playerIds, options.scenario);
    const loop = setInterval(() => {
      advanceWorldTick(worldState, 1 / this.tickRate);
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
