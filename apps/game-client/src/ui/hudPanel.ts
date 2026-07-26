import Phaser from "phaser";

export interface PanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const HUD_TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: "Noto Sans KR, Malgun Gothic, Apple SD Gothic Neo, Trebuchet MS, sans-serif",
  fontSize: "13px",
  color: "#dce8d0",
};

export function drawPanelFrame(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  graphics: Phaser.GameObjects.Graphics,
  bounds: PanelBounds,
  title: string,
): void {
  const { x, y, width, height } = bounds;

  graphics.fillStyle(0x0a1719, 0.92);
  graphics.fillRoundedRect(x, y, width, height, 8);
  graphics.lineStyle(1, 0x46646a, 0.9);
  graphics.strokeRoundedRect(x, y, width, height, 8);
  graphics.fillStyle(0x10262a, 0.9);
  graphics.fillRoundedRect(x + 7, y + 7, width - 14, 28, 6);

  container.add(
    scene.add.text(x + 18, y + 14, title, {
      ...HUD_TEXT_STYLE,
      fontSize: "12px",
      color: "#d0b46a",
    }),
  );
}
