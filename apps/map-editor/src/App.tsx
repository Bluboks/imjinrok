import { useMemo, useState } from "react";
import { createBlankMap, defaultSkirmishScenario, type ScenarioDefinition } from "@shared";
import { PhaserEditorCanvas } from "./components/PhaserEditorCanvas.js";

interface EditorExportBundle {
  map: ReturnType<typeof createBlankMap>;
  scenario: ScenarioDefinition;
}

export function App() {
  const [name, setName] = useState("Foundry Basin");
  const [scenarioName, setScenarioName] = useState("Foundry Basin Skirmish");
  const [objectiveLabel, setObjectiveLabel] = useState("Defeat Opponents");
  const [objectiveDescription, setObjectiveDescription] = useState("Eliminate all opposing players on this map.");
  const [width, setWidth] = useState(32);
  const [height, setHeight] = useState(32);
  const [tileWidth, setTileWidth] = useState(64);
  const [tileHeight, setTileHeight] = useState(32);
  const mapId = useMemo(() => slugify(name) || "custom-map", [name]);

  const mapDefinition = useMemo(
    () =>
      createBlankMap({
        id: mapId,
        name,
        description: "Map editor scaffold preview for future RTS custom scenarios.",
        width,
        height,
        tileWidth,
        tileHeight,
        tags: ["editor", "prototype", "custom-scenario"],
      }),
    [height, mapId, name, tileHeight, tileWidth, width],
  );

  const scenarioDefinition = useMemo<ScenarioDefinition>(
    () => ({
      id: `${mapDefinition.id}-scenario`,
      name: scenarioName,
      description: `Custom scenario authored for ${mapDefinition.name}.`,
      scenarioType: "custom-scenario",
      mapId: mapDefinition.id,
      startingResources: { ...defaultSkirmishScenario.startingResources },
      startingUnits: [...defaultSkirmishScenario.startingUnits],
      objectives: [
        {
          id: "primary-objective",
          label: objectiveLabel,
          description: objectiveDescription,
          type: "defeat-opponents",
          required: true,
        },
      ],
      tags: ["editor", "custom-scenario"],
    }),
    [mapDefinition.id, mapDefinition.name, objectiveDescription, objectiveLabel, scenarioName],
  );

  const exportBundle = (): void => {
    const bundle: EditorExportBundle = {
      map: mapDefinition,
      scenario: scenarioDefinition,
    };

    exportJson(`${mapDefinition.id}.scenario-bundle.json`, bundle);
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

        <div className="panel-card form-card">
          <h2>Scenario</h2>
          <label>
            <span>Scenario Name</span>
            <input value={scenarioName} onChange={(event) => setScenarioName(event.target.value)} />
          </label>
          <label>
            <span>Primary Objective</span>
            <input value={objectiveLabel} onChange={(event) => setObjectiveLabel(event.target.value)} />
          </label>
          <label>
            <span>Objective Description</span>
            <textarea value={objectiveDescription} onChange={(event) => setObjectiveDescription(event.target.value)} />
          </label>
        </div>

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
          <button onClick={() => exportJson(`${mapDefinition.id}.map.json`, mapDefinition)}>Export Map</button>
          <button className="secondary-button" onClick={exportBundle}>Export Bundle</button>
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
    scenario: scenarioDefinition.name,
    objectives: scenarioDefinition.objectives.map((objective) => objective.label),
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

function exportJson(filename: string, data: unknown): void {
  const file = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
