import { useMemo, useState } from "react";
import { createBlankMap } from "@shared";
import { PhaserEditorCanvas } from "./components/PhaserEditorCanvas.js";

export function App() {
  const [name, setName] = useState("Foundry Basin");
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const [tileWidth, setTileWidth] = useState(64);
  const [tileHeight, setTileHeight] = useState(32);

  const mapDefinition = useMemo(
    () =>
      createBlankMap({
        id: "foundry-basin",
        name,
        description: "Map editor scaffold preview for future RTS custom scenarios.",
        width,
        height,
        tileWidth,
        tileHeight,
        tags: ["editor", "prototype", "custom-scenario"],
      }),
    [height, name, tileHeight, tileWidth, width],
  );

  const exportMap = (): void => {
    const file = new Blob([JSON.stringify(mapDefinition, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = `${mapDefinition.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="editor-shell">
      <section className="editor-sidebar">
        <div>
          <p className="eyebrow">Map Builder Scaffold</p>
          <h1>World Builder Shell</h1>
          <p className="lede">
            Warcraft 3 / StarCraft 2 style editor를 염두에 둔 기본 껍데기입니다. 현재는 맵 메타데이터,
            캔버스 프리뷰, JSON export 흐름을 먼저 열어둡니다.
          </p>
        </div>

        <label>
          <span>Map Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>

        <div className="control-grid">
          <label>
            <span>Width</span>
            <input
              type="number"
              min={16}
              max={128}
              value={width}
              onChange={(event) => setWidth(Number(event.target.value) || 16)}
            />
          </label>

          <label>
            <span>Height</span>
            <input
              type="number"
              min={16}
              max={128}
              value={height}
              onChange={(event) => setHeight(Number(event.target.value) || 16)}
            />
          </label>

          <label>
            <span>Tile Width</span>
            <input
              type="number"
              min={32}
              max={128}
              step={16}
              value={tileWidth}
              onChange={(event) => setTileWidth(Number(event.target.value) || 64)}
            />
          </label>

          <label>
            <span>Tile Height</span>
            <input
              type="number"
              min={16}
              max={64}
              step={8}
              value={tileHeight}
              onChange={(event) => setTileHeight(Number(event.target.value) || 32)}
            />
          </label>
        </div>

        <div className="button-row">
          <button onClick={exportMap}>Export JSON</button>
        </div>

        <div className="panel-card">
          <h2>Planned Modules</h2>
          <ul>
            <li>Terrain paint palette and autotiling</li>
            <li>Spawn, resources, objectives, and trigger graph</li>
            <li>Pathing layers, blockers, and AI hint volumes</li>
            <li>Cinematics, scripted events, and publish pipeline</li>
          </ul>
        </div>

        <div className="panel-card compact-card">
          <h2>Current Map Snapshot</h2>
          <pre>
{JSON.stringify(
  {
    id: mapDefinition.id,
    name: mapDefinition.name,
    size: `${mapDefinition.width}x${mapDefinition.height}`,
    tile: `${mapDefinition.tileWidth}x${mapDefinition.tileHeight}`,
    spawnPoints: mapDefinition.spawnPoints.length,
    tags: mapDefinition.tags,
  },
  null,
  2,
)}
          </pre>
        </div>
      </section>

      <section className="editor-preview">
        <div className="preview-header">
          <div>
            <p className="eyebrow">Live Preview</p>
            <h2>{mapDefinition.name}</h2>
          </div>
          <p>{mapDefinition.width * mapDefinition.height} tiles</p>
        </div>
        <PhaserEditorCanvas map={mapDefinition} />
      </section>
    </main>
  );
}
