#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_REPOSITORY_ROOT = ".";

export const CLIENT_UI_LAYOUT_AUDIT_PROBES = [
  {
    id: "hud-shell-responsive-layout",
    sourcePath: "apps/game-client/src/scenes/UIScene.ts",
    patterns: [
      "const hudHeight = this.getHudHeight();",
      "const miniMapWidth = Phaser.Math.Clamp(width * 0.22, 190, 280);",
      "const actionsWidth = Phaser.Math.Clamp(width * 0.28, 292, 360);",
      "graphics.fillRoundedRect(10, hudTop + 8, width - 20, hudHeight - 16, 18);",
      "return Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);",
    ],
    currentBasis: "client-responsive-layout",
    originalEvidenceStatus: "unproven-as-original-layout",
    originalTraceTargets: ["mouse-interface-primary", "mouse-interface-secondary"],
    followUp:
      "Replace HUD shell dimensions only after runtime tracing proves how mouseinterface constants map to screen coordinates or extents.",
  },
  {
    id: "minimap-diamond-layout",
    sourcePath: "apps/game-client/src/ui/minimap.ts",
    patterns: [
      "const diamondWidth = Math.min(width - 36, (height - 54) * 1.55);",
      "const diamondHeight = Math.min(height - 54, diamondWidth * 0.58);",
      "const centerY = y + 48 + diamondHeight / 2;",
    ],
    currentBasis: "client-diamond-fit-formula",
    originalEvidenceStatus: "unproven-as-original-layout",
    originalTraceTargets: ["mouse-interface-primary", "mouse-interface-secondary"],
    followUp:
      "Trace original mouse-interface setup and minimap draw/hit-test paths before treating diamond ratios or padding as parity.",
  },
  {
    id: "action-grid-layout",
    sourcePath: "apps/game-client/src/ui/actionGridLayoutPolicy.ts",
    patterns: [
      "export const ADAPTIVE_ACTION_GRID_LAYOUT: ActionGridLayoutPolicy = {",
      "columns: 4,",
      "rows: 3,",
      "slotCount: 12,",
      "[ORIGINAL_GAMEPLAY_COMMAND_GRID_SCENARIO_ID]: ADAPTIVE_ACTION_GRID_LAYOUT,",
      "export function resolveProductActionGridLayoutForScenario(",
    ],
    currentBasis: "intentional-adaptive-4x3-12-slot-product-policy-with-static-proven-3x3-research-helper",
    originalEvidenceStatus: "static-proven-original-K01-3x3-geometry-and-strict-hit-in-research-helper;intentional-product-adaptation-4x3-12-slot",
    originalTraceTargets: ["FUN_00443360", "FUN_00481ee0", "FUN_0045ad90", "FUN_00459110", "FUN_00447a0f"],
    followUp:
      "Keep source-bound K01 3x3 geometry and strict interior hit in the research helper; K01 product UI must remain the intentional adaptive 4x3/12-slot policy, while labels/actions and HUD placement remain separate project adaptations.",
  },
  {
    id: "selection-panel-layout",
    sourcePath: "apps/game-client/src/ui/selectionPanel.ts",
    patterns: [
      "const portraitSize = Phaser.Math.Clamp(height - 82, 72, 106);",
      "const portraitX = x + 20;",
      "const portraitY = y + 50;",
      "const healthBarWidth = Math.max(120, width - (textX - x) - 24);",
      "const chipSize = Phaser.Math.Clamp((width - 54) / 8, 30, 44);",
    ],
    currentBasis: "client-selection-panel-design",
    originalEvidenceStatus: "unproven-as-original-selection-panel",
    originalTraceTargets: ["mouse-interface-primary", "mouse-interface-secondary"],
    followUp:
      "Trace original selected-unit panel/control records before mapping portrait, health bar, and group chip dimensions.",
  },
  {
    id: "gameplay-selection-hitbox",
    sourcePath: "apps/game-client/src/scenes/SkirmishScene.ts",
    patterns: [
      "const halfWidth = radius * 1.6 * zoom + padding;",
      "const top = radius * zoom + padding;",
      "const bottom = radius * 1.3 * zoom + padding;",
      "const hudHeight = Phaser.Math.Clamp(this.scale.height * 0.26, 178, 220);",
    ],
    currentBasis: "client-selection-ergonomics",
    originalEvidenceStatus: "unproven-as-original-input-hitbox",
    originalTraceTargets: ["draw-runtime-breakpoints", "mouse-interface-primary", "mouse-interface-secondary"],
    followUp:
      "Trace original unit hit-test/draw bounds and HUD clamp before treating selection boxes or battlefield/HUD split as parity.",
  },
  {
    id: "campaign-dialogue-layout",
    sourcePath: "apps/game-client/src/scenes/SkirmishScene.ts",
    patterns: [
      "this.addOriginalSpeechPresentation(",
      "const layout = resolveOriginalSpeechLayout(",
      "const targetScale = portrait.width / 130;",
      ".setScale(animateIntroduction ? 0 : targetScale);",
      "scaleX: targetScale,",
    ],
    currentBasis: "static-proven-SPEECH-slots-and-text-with-project-portrait-scale-in-adaptation",
    originalEvidenceStatus: "static-proven-for-SPEECH-slots-and-text;project-adaptation-for-portrait-scale-in",
    originalTraceTargets: ["FUN_0048311e", "FUN_004a7a50", "FUN_004a8410"],
    followUp:
      "Keep in-game SPEECH slot/text mapping separate from project portrait scale-in; recover title, objective, button, font, and hit-test layout separately.",
  },
  {
    id: "pre-game-briefing-layout",
    sourcePath: "apps/game-client/src/scenes/MissionBriefingScene.ts",
    patterns: [
      "const baseFrame = frames[0];",
      "const completedFrame = frames.at(-1);",
      "getMissionBriefingIntroFrameAlphas(",
      "const targetScale = portrait.width / 130;",
      ".setScale(animateIntroduction ? 0 : targetScale);",
      "scaleX: targetScale,",
    ],
    currentBasis: "project-pre-game-briefing-presentation-with-static-proven-SPEECH-slots-and-text",
    originalEvidenceStatus: "static-proven-for-SPEECH-slots-and-text;project-adaptation-for-base-to-completed-frame-fade-and-portrait-scale-in",
    originalTraceTargets: ["FUN_0048311e", "FUN_004a7a50", "FUN_004a8410"],
    followUp:
      "Keep the pre-game briefing base-to-completed fade and portrait scale-in as project presentation; recover original title, objective, button, font, and hit-test layout separately.",
  },
];

const args = parseArgs(process.argv.slice(2));

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = extractClientUiLayoutAudit(args.root ?? DEFAULT_REPOSITORY_ROOT);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractClientUiLayoutAudit(repositoryRoot = DEFAULT_REPOSITORY_ROOT) {
  const probes = CLIENT_UI_LAYOUT_AUDIT_PROBES.map((probe) => auditProbe(repositoryRoot, probe));

  return {
    repositoryRoot,
    summary: {
      probeCount: probes.length,
      allPatternsPresent: probes.every((probe) => probe.patterns.every((pattern) => pattern.present)),
      unprovenOriginalParityCount: probes.filter((probe) => probe.originalEvidenceStatus.includes("unproven")).length,
    },
    probes,
  };
}

function auditProbe(repositoryRoot, probe) {
  const absolutePath = join(repositoryRoot, probe.sourcePath);
  const source = readFileSync(absolutePath, "utf8");
  const lines = source.split(/\r?\n/);

  return {
    ...probe,
    patterns: probe.patterns.map((pattern) => {
      const lineIndex = lines.findIndex((line) => line.includes(pattern));

      return {
        text: pattern,
        present: lineIndex !== -1,
        line: lineIndex === -1 ? undefined : lineIndex + 1,
      };
    }),
  };
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--root") {
      parsed.root = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printReport(report) {
  console.log(`Client UI layout audit: ${report.repositoryRoot}`);
  console.log(`  probes: ${report.summary.probeCount}`);
  console.log(`  all patterns present: ${report.summary.allPatternsPresent ? "yes" : "no"}`);
  console.log(`  unproven original parity probes: ${report.summary.unprovenOriginalParityCount}`);

  for (const probe of report.probes) {
    console.log(`  ${probe.id} ${probe.originalEvidenceStatus}`);
    for (const pattern of probe.patterns) {
      console.log(`    ${pattern.present ? "ok" : "missing"} ${probe.sourcePath}:${pattern.line ?? "?"} ${pattern.text}`);
    }
  }
}
