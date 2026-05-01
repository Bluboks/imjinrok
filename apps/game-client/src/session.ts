import type { ConnectionMode, EntryMode, ScenarioType, SessionSummary } from "@shared";

export interface GameLaunchContext {
  entryMode: EntryMode;
  connectionMode: ConnectionMode;
  scenarioType: ScenarioType;
  session: SessionSummary | null;
  serverOnline: boolean;
}
