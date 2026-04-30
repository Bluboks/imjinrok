import type { GameMode, SessionSummary } from "@shared";

export interface GameLaunchContext {
  mode: GameMode;
  session: SessionSummary | null;
  serverOnline: boolean;
}
