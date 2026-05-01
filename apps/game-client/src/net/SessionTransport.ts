import type { CommandEnvelope, MapDefinition } from "@shared";
import { advanceWorldTick, createInitialWorldState, issueCommand as issueWorldCommand, SIM_TICK_SECONDS, type WorldSnapshot, type WorldState } from "@simulation";
import type { GameLaunchContext } from "../session.js";
import { NetworkClient } from "./NetworkClient.js";

const REMOTE_POLL_INTERVAL_MS = 200;
const SIM_TICK_MILLISECONDS = SIM_TICK_SECONDS * 1000;

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
  private tickAccumulatorMs = 0;

  constructor(private readonly worldState: WorldState) {}

  getSnapshot(): WorldState {
    return this.worldState;
  }

  update(time: number, delta = 0): void {
    const elapsedMs = this.lastTickAt === 0 ? delta : time - this.lastTickAt;

    this.lastTickAt = time;
    this.tickAccumulatorMs += Math.max(0, elapsedMs);

    if (this.tickAccumulatorMs < SIM_TICK_MILLISECONDS) {
      return;
    }

    while (this.tickAccumulatorMs >= SIM_TICK_MILLISECONDS) {
      advanceWorldTick(this.worldState);
      this.tickAccumulatorMs -= SIM_TICK_MILLISECONDS;
    }
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
    if (snapshot.tick === this.latestSnapshot.tick) {
      return this.latestSnapshot;
    }

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
