import type { CommandEnvelope, GridPoint, MapDefinition } from "../../shared/src/index.js";
import type { WorldState } from "./types.js";

export function applyCommand(state: WorldState, envelope: CommandEnvelope): void {
  state.lastAcceptedCommand = envelope;

  switch (envelope.command.type) {
    case "move":
    case "attack-move": {
      const unit = state.units[envelope.command.unitId];

      if (!unit) {
        return;
      }

      if (unit.movementSpeed <= 0) {
        return;
      }

      unit.movementTarget = clampMapPoint(state.map, envelope.command.target);
      return;
    }
    case "stop": {
      const unit = state.units[envelope.command.unitId];

      if (unit) {
        delete unit.movementTarget;
      }

      return;
    }
    case "build":
    case "gather":
      return;
  }
}

function clampMapPoint(map: MapDefinition, point: GridPoint): GridPoint {
  return {
    x: Math.max(0, Math.min(map.width - 1, point.x)),
    y: Math.max(0, Math.min(map.height - 1, point.y)),
  };
}
