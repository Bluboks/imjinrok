import {
  MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY,
  MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
  MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY,
} from "./mainMenuAudio.js";
import type { MainMenuAction } from "./mainMenuFlow.js";

export interface MainMenuImageAssetDefinition {
  key: string;
  url: string;
}

const LANDING_IMAGE = {
  key: "main-menu:landing",
  url: "/assets/themes/default/ui/main-menu/title/title_0000.png",
} as const satisfies MainMenuImageAssetDefinition;

export const MAIN_MENU_RESOURCE_PLAN = {
  critical: {
    images: [LANDING_IMAGE],
    audioCueKeys: [],
  },
  deferred: {
    images: [
      {
        key: "main-menu:menu-border",
        url: "/assets/themes/default/ui/main-menu/game-menu-border/gamemenuborder_0000.png",
      },
      {
        key: "main-menu:menu-button",
        url: "/assets/themes/default/ui/main-menu/game-menu-buttons/gamemenubutton_0000.png",
      },
      {
        key: "main-menu:nation-button",
        url: "/assets/themes/default/ui/main-menu/nation-buttons/NationButtons_0000.png",
      },
      {
        key: "main-menu:stage-border",
        url: "/assets/themes/default/ui/main-menu/stage-border/selectstageborder_0000.png",
      },
      {
        key: "main-menu:stage",
        url: "/assets/themes/default/ui/main-menu/stage/title/titlestartstage_0000.png",
      },
      {
        key: "main-menu:stage-korea",
        url: "/assets/themes/default/ui/main-menu/stage/korea/titlestartstagekorea_0000.png",
      },
      {
        key: "main-menu:select-box",
        url: "/assets/themes/default/ui/main-menu/stage/select-box/selectbox_0000.png",
      },
    ],
    audioCueKeys: [
      MAIN_MENU_BACKGROUND_MUSIC_AUDIO_CUE_KEY,
      MAIN_MENU_BUTTON_AUDIO_CUE_KEY,
      MAIN_MENU_COUNTRY_SELECT_AUDIO_CUE_KEY,
    ],
  },
} as const;

/**
 * Product performance policy for the first paint after a cold launch. Boot
 * owns no resources; the main-menu landing image is the only critical asset.
 */
export const INITIAL_LANDING_RESOURCE_POLICY = {
  boot: {
    images: [] as readonly MainMenuImageAssetDefinition[],
    audioCueKeys: [] as readonly string[],
  },
  mainMenu: MAIN_MENU_RESOURCE_PLAN,
} as const;

export const MAIN_MENU_ASSETS = {
  landing: LANDING_IMAGE,
  menuBorder: MAIN_MENU_RESOURCE_PLAN.deferred.images[0],
  menuButton: MAIN_MENU_RESOURCE_PLAN.deferred.images[1],
  nationButton: MAIN_MENU_RESOURCE_PLAN.deferred.images[2],
  stageBorder: MAIN_MENU_RESOURCE_PLAN.deferred.images[3],
  stage: MAIN_MENU_RESOURCE_PLAN.deferred.images[4],
  korea: MAIN_MENU_RESOURCE_PLAN.deferred.images[5],
  selectBox: MAIN_MENU_RESOURCE_PLAN.deferred.images[6],
} as const;

const DEFERRED_MAIN_MENU_ACTIONS = new Set<MainMenuAction>([
  "show-campaign-country",
  "show-random",
  "show-preferences",
]);

export function requiresDeferredMainMenuResources(action: MainMenuAction): boolean {
  return DEFERRED_MAIN_MENU_ACTIONS.has(action);
}

/**
 * Keeps at most one intent while noncritical menu resources are loading. The
 * most recent intent is the one the user still sees as pending, and it is
 * released exactly once when the deferred load becomes ready.
 */
export class MainMenuDeferredActionQueue<Action> {
  private ready = false;
  private pendingAction: Action | null = null;

  get isReady(): boolean {
    return this.ready;
  }

  request(action: Action): Action | null {
    if (this.ready) {
      return action;
    }

    this.pendingAction = action;
    return null;
  }

  markReady(): Action | null {
    if (this.ready) {
      return null;
    }

    this.ready = true;
    const action = this.pendingAction;
    this.pendingAction = null;
    return action;
  }

  reset(): void {
    this.ready = false;
    this.pendingAction = null;
  }
}
