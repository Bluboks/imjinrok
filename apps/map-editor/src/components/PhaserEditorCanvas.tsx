import { useEffect, useRef } from "react";
import type { MapDefinition } from "@shared";
import { createEditorGame } from "../phaser/createEditorGame.js";

interface PhaserEditorCanvasProps {
  map: MapDefinition;
}

export function PhaserEditorCanvas({ map }: PhaserEditorCanvasProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const game = createEditorGame(hostRef.current, map);

    return () => {
      game.destroy(true);
    };
  }, [map]);

  return <div ref={hostRef} className="editor-canvas-host" />;
}
