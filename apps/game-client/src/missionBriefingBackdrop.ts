import type {
  ScenarioBriefingDefinition,
  ScenarioBriefingTitleFrameDefinition,
} from "@shared";

const BACKDROP_IMAGE_PREFIX = "image:mission-briefing-backdrop:";
const BACKDROP_ASSET_ROOT_URL = "assets/themes/default/ui/briefing";

export interface MissionBriefingBackdropFrame {
  key: string;
  url: string;
  durationMs: number;
}

export function collectMissionBriefingBackdropFrames(
  briefing: ScenarioBriefingDefinition | undefined,
): MissionBriefingBackdropFrame[] {
  return (briefing?.titleSequence ?? []).map(createMissionBriefingBackdropFrame);
}

export function createMissionBriefingBackdropFrame(
  frame: ScenarioBriefingTitleFrameDefinition,
): MissionBriefingBackdropFrame {
  const sourceAsset = normalizeMissionBriefingBackdropSourceAsset(frame.sourceAsset);
  const sourceWithoutExtension = sourceAsset.replace(/\.[^/.]+$/, "");
  const publicAssetPath = sourceWithoutExtension.replace(/^ybriefingfnt\//, "");
  const key = publicAssetPath.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  return {
    key: `${BACKDROP_IMAGE_PREFIX}${key}`,
    url: `${BACKDROP_ASSET_ROOT_URL}/${publicAssetPath}_0000.png`,
    durationMs: frame.durationMs,
  };
}

function normalizeMissionBriefingBackdropSourceAsset(sourceAsset: string): string {
  return sourceAsset.trim().replaceAll("\\", "/").replace(/^\/+/, "").toLowerCase();
}
