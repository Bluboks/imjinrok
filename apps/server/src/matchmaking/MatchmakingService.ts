import type {
  MatchmakingJoinRequest,
  MatchmakingTicket,
  SessionSummary,
} from "../../../../packages/shared/src/index.js";

type MatchFoundHandler = (tickets: MatchmakingTicket[]) => SessionSummary;

export class MatchmakingService {
  private readonly queue: MatchmakingTicket[] = [];

  constructor(private readonly onMatchFound: MatchFoundHandler) {}

  join(request: MatchmakingJoinRequest): { ticket: MatchmakingTicket; session: SessionSummary | null } {
    const existingTicket = this.queue.find((ticket) => ticket.playerId === request.playerId);

    if (existingTicket) {
      return {
        ticket: existingTicket,
        session: null,
      };
    }

    const ticket: MatchmakingTicket = {
      ...request,
      queuedAt: Date.now(),
    };

    this.queue.push(ticket);

    return {
      ticket,
      session: this.tryMatch(),
    };
  }

  listQueue(): MatchmakingTicket[] {
    return [...this.queue];
  }

  private tryMatch(): SessionSummary | null {
    const sortedQueue = [...this.queue].sort((left, right) => left.queuedAt - right.queuedAt);

    for (let index = 0; index < sortedQueue.length - 1; index += 1) {
      const current = sortedQueue[index];
      const next = sortedQueue[index + 1];

      if (!current || !next) {
        continue;
      }

      if (current.region !== next.region) {
        continue;
      }

      if (Math.abs(current.rating - next.rating) > 250) {
        continue;
      }

      this.removeTicket(current.playerId);
      this.removeTicket(next.playerId);

      return this.onMatchFound([current, next]);
    }

    return null;
  }

  private removeTicket(playerId: string): void {
    const index = this.queue.findIndex((ticket) => ticket.playerId === playerId);

    if (index >= 0) {
      this.queue.splice(index, 1);
    }
  }
}
