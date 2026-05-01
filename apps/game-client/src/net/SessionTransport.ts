import type { CommandEnvelope, MapDefinition } from "@shared";
import { advanceWorldTick, createInitialWorldState, issueCommand as issueWorldCommand, type WorldSnapshot, type WorldState } from "@simulation";
import type { GameLaunchContext } from "../session.js";
import { NetworkClient } from "./NetworkClient.js";

const LOCAL_TICK_INTERVAL_MS = 100;
const REMOTE_POLL_INTERVAL_MS = 200;

export interface SessionTransport {
  readonly isRemote: boolean;
  getSnapshot(): WorldState;
  update(time: number, delta: number): void;
  issueCommand(envelope: CommandEnvelope): Promise<void> | void;
  dispose(): void;
}

export class LocalSessionTransport implements SessionTransport {
  readonly isRemote = false;
  private lastTickAt = 0;

  constructor(private readonly worldState: WorldState) {}

  getSnapshot(): WorldState {
    return this.worldState;
  }

  update(time: number): void {
    if (time - this.lastTickAt < LOCAL_TICK_INTERVAL_MS) {
      return;
    }

    advanceWorldTick(this.worldState, this.lastTickAt === 0 ? 0.1 : (time - this.lastTickAt) / 1000);
    this.lastTickAt = time;
  }

  issueCommand(envelope: CommandEnvelope): void {
    const result = issueWorldCommand(this.worldState, envelope);

    if (!result.ok) {
      console.warn("Local command rejected", result.reason);
    }
  }

  dispose(): void {
    // No external resources.
  }
}

export class RemoteSessionTransport implements SessionTransport {
  readonly isRemote = true;
  private latestSnapshot: WorldState;
  private lastPollAt = Number.NEGATIVE_INFINITY;
  private snapshotRequestInFlight = false;
  private disposed = false;

  constructor(
    initialSnapshot: WorldState,
    private readonly networkClient: NetworkClient,
    private readonly sessionId: string,
  ) {
    this.latestSnapshot = initialSnapshot;
  }

  getSnapshot(): WorldState {
    return this.latestSnapshot;
  }

  update(time: number): void {
    if (this.disposed || this.snapshotRequestInFlight || time - this.lastPollAt < REMOTE_POLL_INTERVAL_MS) {
      return;
    }

    this.lastPollAt = time;
    this.snapshotRequestInFlight = true;
    void this.networkClient
      .getSessionSnapshot(this.sessionId)
      .then((snapshot) => {
        if (!this.disposed) {
          this.latestSnapshot = this.mergeSnapshot(snapshot);
        }
      })
      .catch((error: unknown) => {
        console.warn("Failed to fetch session snapshot", error);
      })
      .finally(() => {
        this.snapshotRequestInFlight = false;
      });
  }

  async issueCommand(envelope: CommandEnvelope): Promise<void> {
    try {
      const result = await this.networkClient.issueCommand(envelope);

      if (!result.ok) {
        console.warn("Remote command rejected", result.reason);
      }
    } catch (error) {
      console.warn("Failed to issue session command", error);
    }
  }

  dispose(): void {
    this.disposed = true;
  }

  private mergeSnapshot(snapshot: WorldSnapshot): WorldState {
    return {
      ...snapshot,
      map: this.latestSnapshot.map,
    };
  }
}

export function createSessionTransport(
  context: GameLaunchContext,
  map: MapDefinition,
  players: string[],
  networkClient = new NetworkClient(),
): SessionTransport {
  const initialSnapshot = createInitialWorldState(map, players);

  if (context.connectionMode === "local" || !context.session) {
    return new LocalSessionTransport(initialSnapshot);
  }

  return new RemoteSessionTransport(initialSnapshot, networkClient, context.session.id);
}
