import type {
  CommandEnvelope,
  ConnectionMode,
  EntryMode,
  MapDefinition,
  ScenarioDefinition,
  SessionSummary,
} from "../shared.js";
import {
  advanceWorldTick,
  createInitialWorldState,
  issueCommand as issueWorldCommand,
  SIM_TICK_SECONDS,
  SIM_TICKS_PER_SECOND,
  toWorldSnapshot,
  type WorldSnapshot,
  type WorldState,
} from "../simulation.js";
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

export type GameSessionIssueCommandResult =
  | { status: "accepted"; command: CommandEnvelope }
  | { status: "not-found" }
  | { status: "rejected"; reason: string };

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
      tickRate: SIM_TICKS_PER_SECOND,
    };

    const worldState = createInitialWorldState(options.map, options.playerIds, options.scenario);
    const loop = setInterval(() => {
      advanceWorldTick(worldState);
    }, SIM_TICK_SECONDS * 1000);

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

  issueCommand(envelope: CommandEnvelope): GameSessionIssueCommandResult {
    const session = this.sessions.get(envelope.sessionId);

    if (!session) {
      return { status: "not-found" };
    }

    if (!session.summary.playerIds.includes(envelope.playerId)) {
      return { status: "rejected", reason: "player is not in session" };
    }

    // TODO: replace the client-supplied playerId with an authenticated session player once auth/session tokens exist.

    const result = issueWorldCommand(session.worldState, envelope);

    if (!result.ok) {
      return { status: "rejected", reason: result.reason };
    }

    return { status: "accepted", command: result.envelope };
  }

  getSnapshot(sessionId: string): WorldSnapshot | null {
    const session = this.sessions.get(sessionId);

    return session ? toWorldSnapshot(session.worldState) : null;
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      clearInterval(session.loop);
    }
  }
}
