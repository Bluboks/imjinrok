export interface MainMenuPreferenceControlsLayout {
  speedY: number;
  mouseY: number;
  bottom: number;
}

const PREFERENCE_SPEED_OFFSET_Y = 76;
const PREFERENCE_MOUSE_OFFSET_Y = 21;
const PREFERENCE_LINE_HEIGHT = 18;
const PREFERENCE_TO_MENU_GAP = 20;

export function getMainMenuPreferenceControlsLayout(titleY: number): MainMenuPreferenceControlsLayout {
  const speedY = titleY + PREFERENCE_SPEED_OFFSET_Y;
  const mouseY = speedY + PREFERENCE_MOUSE_OFFSET_Y;

  return { speedY, mouseY, bottom: mouseY + PREFERENCE_LINE_HEIGHT };
}

export function getMainMenuTop(height: number, titleY: number): number {
  const baseMenuTop = Math.max(180, Math.min(titleY + 116, height * 0.33));
  const preferences = getMainMenuPreferenceControlsLayout(titleY);

  return Math.max(baseMenuTop, preferences.bottom + PREFERENCE_TO_MENU_GAP);
}

export function getMenuOptionStepY(height: number, menuTop: number, optionCount: number): number {
  const minimumStepY = optionCount >= 7 ? 20 : 34;
  const preferredStepY = (height - menuTop - 96) / Math.max(optionCount + 1, 2);

  return Math.min(46, Math.max(minimumStepY, preferredStepY));
}
