import type { UnitDefinitionId } from "@shared";
import type { GameplayAudioCueKey, UnitAudioAction } from "./gameplayAudio.js";

/**
 * This inventory is a product-audio boundary for every source-spawnable K01 kind.
 * It records source identity evidence separately from the product choice to play a
 * cue; it does not establish original action-to-cue scheduling semantics.
 */
export type K01GameplayAudioCoverageStatus = "already-covered" | "source-backed-adapter" | "unresolved";

export interface K01GameplayAudioActionCoverage {
  readonly action: UnitAudioAction;
  readonly cueKey: GameplayAudioCueKey;
}

export interface K01GameplayAudioCoverageEntry {
  readonly kind: UnitDefinitionId;
  readonly status: K01GameplayAudioCoverageStatus;
  readonly actions: readonly K01GameplayAudioActionCoverage[];
  readonly evidenceDocument: string;
  readonly note?: string;
}

const select = (cueKey: GameplayAudioCueKey): K01GameplayAudioActionCoverage => ({ action: "select", cueKey });
const move = (cueKey: GameplayAudioCueKey): K01GameplayAudioActionCoverage => ({ action: "move", cueKey });
const attack = (cueKey: GameplayAudioCueKey): K01GameplayAudioActionCoverage => ({ action: "attack", cueKey });
const die = (cueKey: GameplayAudioCueKey): K01GameplayAudioActionCoverage => ({ action: "die", cueKey });

/**
 * K01 source-opening and K0120-reinforcement kinds. Keep unresolved entries
 * explicit: adding a cue requires changing this inventory and its test first.
 */
export const K01_GAMEPLAY_AUDIO_COVERAGE = [
  { kind: "town-center", status: "already-covered", actions: [select("audio:voice:hq-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "house", status: "already-covered", actions: [select("audio:voice:mill-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "barracks", status: "already-covered", actions: [select("audio:voice:barrack-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "korean-training-command", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "gwon-yul", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/unit-production-audio-policy.md", note: "No exact hero voice-family identity or production-complete mapping is established." },
  { kind: "swordsman", status: "already-covered", actions: [select("audio:voice:select-sword-k1"), move("audio:voice:move-sword-k1"), attack("audio:voice:attack-sword-k1"), die("audio:voice:die-sword-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md" },
  { kind: "korean-monk", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md", note: "No exact monk voice-family identity adapter is established." },
  { kind: "archer", status: "already-covered", actions: [select("audio:voice:select-archer-k1"), move("audio:voice:move-archer-k1"), attack("audio:voice:attack-archer-k1"), die("audio:voice:die-archer-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md" },
  { kind: "villager", status: "already-covered", actions: [select("audio:voice:select-farmer-k1"), move("audio:voice:move-farmer-k1"), attack("audio:voice:attack-farmer-k1"), die("audio:voice:die-farmer-k1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-korean-farmer-core-frames.md" },
  { kind: "ryu-seong-ryong", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/unit-production-audio-policy.md", note: "No exact hero voice-family identity or production-complete mapping is established." },
  { kind: "japanese-swordsman", status: "already-covered", actions: [select("audio:voice:select-sword-j1"), move("audio:voice:move-sword-j1"), attack("audio:voice:attack-sword-j1"), die("audio:voice:die-sword-j1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-core-unit-animation-states.md" },
  { kind: "japanese-samurai", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-samurai-animation-pilot.md", note: "Class 13 uses horseswordj1/2.spr, so swordj1 cues are not an identity adapter." },
  { kind: "japanese-gunner", status: "already-covered", actions: [select("audio:voice:select-gun-j1"), move("audio:voice:move-gun-j1"), attack("audio:voice:attack-gun-j1"), die("audio:voice:die-gun-j1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-normal-reinforcement-animation-batch.md" },
  { kind: "japanese-farmer", status: "source-backed-adapter", actions: [select("audio:voice:select-farmer-j1"), move("audio:voice:move-farmer-j1"), attack("audio:voice:attack-farmer-j1")], evidenceDocument: "docs/development/k01-gameplay-audio-adapter.md", note: "Select, move, and attack labels are product scheduling adapters; die remains unresolved." },
  { kind: "japanese-shrine-maiden", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-unit-bindings.md", note: "No exact shrine-maiden voice-family identity adapter is established." },
  { kind: "japanese-camp-house", status: "already-covered", actions: [select("audio:voice:hq-j1")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "japanese-hq", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "japanese-camp-barracks", status: "already-covered", actions: [select("audio:voice:barrack-j")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "japanese-camp-firehouse", status: "already-covered", actions: [select("audio:voice:firehouse-j")], evidenceDocument: "docs/reverse-engineering/data-structures/entity-type-catalog.md" },
  { kind: "japanese-camp-tower", status: "already-covered", actions: [select("audio:voice:firehouse-j")], evidenceDocument: "docs/reverse-engineering/mechanics/k01-opening-building-bindings.md" },
  { kind: "japanese-konishi", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-reinforcement-identity-map.md", note: "No exact Konishi voice-family identity adapter is established." },
  { kind: "japanese-turtle-tank", status: "unresolved", actions: [], evidenceDocument: "docs/reverse-engineering/mechanics/k01-turtle-tank-animation-pilot.md", note: "No exact turtle-tank voice-family identity adapter is established." },
] as const satisfies readonly K01GameplayAudioCoverageEntry[];
