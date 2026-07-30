import type { MainMenuSourcePoint } from "./mainMenuLayout.js";

export interface MainMenuCountryMaskPixel {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export const CLASSIC_CAMPAIGN_COUNTRIES = [
  {
    id: "korea",
    label: "조선 (朝鮮)",
    selectedScreen: "korea",
    maskColor: { red: 0, green: 202, blue: 0 },
    isMissionListAvailable: true,
  },
  {
    id: "japan",
    label: "일본 (日本)",
    selectedScreen: "japan",
    maskColor: { red: 202, green: 202, blue: 0 },
    isMissionListAvailable: false,
  },
  {
    id: "china",
    label: "명 (明)",
    selectedScreen: "china",
    maskColor: { red: 202, green: 0, blue: 0 },
    isMissionListAvailable: false,
  },
] as const;

export type CampaignNation = (typeof CLASSIC_CAMPAIGN_COUNTRIES)[number];
export type CampaignNationId = CampaignNation["id"];

export function resolveCampaignNationAtSourcePoint(
  point: MainMenuSourcePoint,
  getMaskPixel: (x: number, y: number) => MainMenuCountryMaskPixel | null,
): CampaignNation | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }

  const pixel = getMaskPixel(Math.floor(point.x), Math.floor(point.y));
  if (!pixel || pixel.alpha === 0) {
    return null;
  }

  return (
    CLASSIC_CAMPAIGN_COUNTRIES.find(
      (nation) =>
        nation.maskColor.red === pixel.red &&
        nation.maskColor.green === pixel.green &&
        nation.maskColor.blue === pixel.blue,
    ) ?? null
  );
}

export function resolveCampaignNationMissionAction(
  nation: CampaignNation | null,
): "show-campaign-stage" | null {
  return nation?.isMissionListAvailable ? "show-campaign-stage" : null;
}
