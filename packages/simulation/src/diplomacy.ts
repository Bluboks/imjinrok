import type { WorldState } from "./types.js";

export function getPlayerTeamId(state: WorldState, playerId: string): string {
  return state.players[playerId]?.teamId ?? playerId;
}

export function arePlayersAllied(state: WorldState, firstPlayerId: string, secondPlayerId: string): boolean {
  return getPlayerTeamId(state, firstPlayerId) === getPlayerTeamId(state, secondPlayerId);
}

export function arePlayersEnemies(state: WorldState, firstPlayerId: string, secondPlayerId: string): boolean {
  return (
    state.players[firstPlayerId] !== undefined &&
    state.players[secondPlayerId] !== undefined &&
    !arePlayersAllied(state, firstPlayerId, secondPlayerId)
  );
}
