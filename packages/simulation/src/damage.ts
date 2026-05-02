import type { DamageType } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

export interface DamagePacket {
  amount: number;
  type: DamageType;
}

export function resolveDamageAmount(packet: DamagePacket, state: WorldState): number {
  const amount = normalizeAmount(packet.amount);

  if (state.environment.weather === "rain" && packet.type === "fire") {
    return amount * getRainFireDamageMultiplier(state);
  }

  return amount;
}

function normalizeAmount(amount: number): number {
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

function getRainFireDamageMultiplier(state: WorldState): number {
  const multiplier = state.map.environment?.rain?.fireDamageMultiplier ?? 1;

  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
