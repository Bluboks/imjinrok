export interface MissionPortraitImageDefinition {
  portraitId: string;
  frameIndex: number;
  key: string;
  url: string;
}

export const MISSION_PORTRAIT_SOURCE =
  "original/imjinrok2/yfnt/hero.spr";

export const MISSION_PORTRAIT_FRAME_BY_ID = {
  K1: 6,
  K2: 11,
  K3: 8,
  K4: 9,
  K5: 7,
  J1: 4,
  J2: 2,
  J3: 3,
  J4: 1,
  J5: 0,
  C1: 5,
  C2: 14,
  C3: 13,
  C4: 10,
  C5: 12,
  K10: 15,
  K6: 17,
} as const satisfies Readonly<Record<string, number>>;

const MISSION_PORTRAIT_IMAGE_PREFIX = "image:mission-portrait:";
const MISSION_PORTRAIT_ASSET_ROOT_URL =
  "assets/themes/default/ui/mission-portraits";

export const MISSION_PORTRAIT_IMAGE_CUES: readonly MissionPortraitImageDefinition[] =
  Object.entries(MISSION_PORTRAIT_FRAME_BY_ID).map(
    ([portraitId, frameIndex]): MissionPortraitImageDefinition => ({
      portraitId,
      frameIndex,
      key: `${MISSION_PORTRAIT_IMAGE_PREFIX}${portraitId.toLowerCase()}`,
      url: `${MISSION_PORTRAIT_ASSET_ROOT_URL}/hero_${String(frameIndex).padStart(4, "0")}.png`,
    }),
  );

export function normalizeMissionPortraitId(portraitId: string): string {
  return portraitId.trim().toUpperCase();
}
