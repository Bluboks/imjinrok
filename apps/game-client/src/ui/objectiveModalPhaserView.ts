import type Phaser from "phaser";
import {
  type ObjectiveModalPointer,
  type ObjectiveModalPresenterHost,
  type ObjectiveModalPresenterLayout,
  type ObjectiveModalPresenterView,
  type ObjectiveModalPresenterViewRequest,
} from "./objectiveModalPresenter.js";

export function createPhaserObjectiveModalPresenterHost(
  scene: Phaser.Scene,
): ObjectiveModalPresenterHost {
  const keyboard = scene.input.keyboard;
  if (!keyboard) {
    throw new Error(
      `objective modal presenter requires Phaser keyboard input for Escape dismissal in scene "${scene.scene.key}"`,
    );
  }

  return {
    getViewportSize: () => ({
      width: scene.scale.width,
      height: scene.scale.height,
    }),
    hasTexture: (textureKey) => scene.textures.exists(textureKey),
    acquireInputOwnership: () =>
      acquirePhaserObjectiveModalInputOwnership(
        scene,
        scene.game.scene.getScenes(true),
      ),
    createView: (request) => createPhaserObjectiveModalView(scene, request),
    onEscape: (listener) => {
      keyboard.on("keydown-ESC", listener);
    },
    offEscape: (listener) => {
      keyboard.off("keydown-ESC", listener);
    },
    onResize: (listener) => {
      scene.scale.on("resize", listener);
    },
    offResize: (listener) => {
      scene.scale.off("resize", listener);
    },
  };
}

export interface ObjectiveModalPhaserInputScene {
  readonly input: {
    enabled: boolean;
    readonly keyboard?: {
      enabled: boolean;
    } | null;
  };
}

export function acquirePhaserObjectiveModalInputOwnership(
  ownerScene: ObjectiveModalPhaserInputScene,
  activeScenes: readonly ObjectiveModalPhaserInputScene[],
): { release(): void } {
  if (!activeScenes.includes(ownerScene)) {
    throw new Error(
      "objective modal input ownership requires its UIScene owner to be active",
    );
  }

  const snapshots = activeScenes
    .filter((scene) => scene !== ownerScene)
    .map((scene) => ({
      scene,
      inputEnabled: scene.input.enabled,
      keyboardEnabled: scene.input.keyboard?.enabled,
    }));

  for (const snapshot of snapshots) {
    snapshot.scene.input.enabled = false;
    if (snapshot.scene.input.keyboard) {
      snapshot.scene.input.keyboard.enabled = false;
    }
  }

  let released = false;
  return {
    release: () => {
      if (released) {
        return;
      }
      released = true;
      for (const snapshot of snapshots) {
        snapshot.scene.input.enabled = snapshot.inputEnabled;
        if (
          snapshot.keyboardEnabled !== undefined &&
          snapshot.scene.input.keyboard
        ) {
          snapshot.scene.input.keyboard.enabled = snapshot.keyboardEnabled;
        }
      }
    },
  };
}

function createPhaserObjectiveModalView(
  scene: Phaser.Scene,
  request: ObjectiveModalPresenterViewRequest,
): ObjectiveModalPresenterView {
  const container = scene.add
    .container(0, 0)
    .setScrollFactor(0)
    .setDepth(10_000);

  try {
    const backdropGraphics = scene.add.graphics().setScrollFactor(0);
    const blocker = scene.add
      .zone(0, 0, request.layout.viewport.width, request.layout.viewport.height)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setInteractive();
    const frame = scene.add
      .image(0, 0, request.textureKey)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    const dismissGraphics = scene.add.graphics().setScrollFactor(0);
    const primaryText = scene.add
      .text(0, 0, request.content.primaryText, objectiveTextStyle())
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    const secondaryText = scene.add
      .text(0, 0, request.content.secondaryText, objectiveTextStyle())
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    const dismissLabel = scene.add
      .text(0, 0, "닫기  ESC", dismissTextStyle())
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0);

    blocker
      .on(
        "pointerdown",
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          request.input.pointerDown(toObjectiveModalPointer(pointer));
        },
      )
      .on(
        "pointermove",
        (
          _pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
        },
      )
      .on(
        "pointerup",
        (
          pointer: Phaser.Input.Pointer,
          _localX: number,
          _localY: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
          request.input.pointerUp(toObjectiveModalPointer(pointer));
        },
      )
      .on(
        "wheel",
        (
          _pointer: Phaser.Input.Pointer,
          _deltaX: number,
          _deltaY: number,
          _deltaZ: number,
          event: Phaser.Types.Input.EventData,
        ) => {
          event.stopPropagation();
        },
      );

    container.add([
      backdropGraphics,
      blocker,
      frame,
      primaryText,
      secondaryText,
      dismissGraphics,
      dismissLabel,
    ]);

    const relayout = (layout: ObjectiveModalPresenterLayout): void => {
      const { viewport, original } = layout;
      backdropGraphics
        .clear()
        .fillStyle(0x080705, 0.78)
        .fillRect(0, 0, viewport.width, viewport.height);
      dismissGraphics
        .clear()
        .fillStyle(0x241a12, 0.82)
        .fillRect(
          original.dismissButton.x,
          original.dismissButton.y,
          original.dismissButton.width,
          original.dismissButton.height,
        )
        .lineStyle(Math.max(1, original.scale), 0xb99a61, 0.92)
        .strokeRect(
          original.dismissButton.x,
          original.dismissButton.y,
          original.dismissButton.width,
          original.dismissButton.height,
        );
      blocker
        .disableInteractive()
        .setPosition(0, 0)
        .setSize(viewport.width, viewport.height)
        .setInteractive();
      frame
        .setPosition(original.frame.x, original.frame.y)
        .setDisplaySize(original.frame.width, original.frame.height);
      primaryText
        .setPosition(original.content.x, original.text.firstCenterY)
        .setFontSize(16 * original.scale)
        .setWordWrapWidth(original.text.maxWidth, true);
      secondaryText
        .setPosition(original.content.x, original.text.secondCenterY)
        .setFontSize(16 * original.scale)
        .setWordWrapWidth(original.text.maxWidth, true);
      dismissLabel
        .setPosition(
          original.dismissButton.x + original.dismissButton.width / 2,
          original.dismissButton.y + original.dismissButton.height / 2,
        )
        .setFontSize(10 * original.scale);
    };

    relayout(request.layout);

    return {
      relayout,
      destroy: () => {
        container.destroy(true);
      },
    };
  } catch (error) {
    container.destroy(true);
    throw new Error(
      `failed to create objective modal presentation using texture "${request.textureKey}": ${describeError(error)}`,
      { cause: error },
    );
  }
}

function objectiveTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: '"Noto Serif KR", Batang, serif',
    fontSize: "16px",
    color: "#f2e2bd",
    stroke: "#1a100b",
    strokeThickness: 2,
    lineSpacing: 5,
    wordWrap: {
      width: 320,
      useAdvancedWrap: true,
    },
  };
}

function dismissTextStyle(): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
    fontSize: "10px",
    color: "#f0dfb4",
    stroke: "#130d09",
    strokeThickness: 1,
  };
}

export interface ObjectiveModalPhaserPointerEvent {
  readonly x: number;
  readonly y: number;
  readonly button: number;
  readonly buttons: number;
  readonly wasTouch: boolean;
}

export function toObjectiveModalPointer(
  pointer: ObjectiveModalPhaserPointerEvent,
): ObjectiveModalPointer {
  return {
    x: pointer.x,
    y: pointer.y,
    primaryButton: pointer.wasTouch || pointer.button === 0,
  };
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
