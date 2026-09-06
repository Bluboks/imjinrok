#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { extractExecutableReferences } from "./extract-executable-refs.mjs";

const DEFAULT_REPOSITORY_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const ARCHIVED_RUNTIME_NOTES_PATH =
  "docs/archive/legacy-2026-07-26/reverse-engineering/imjinrok2-vm-runtime-analysis.md";
const SOURCE_SCRIPT_NAMES = ["K0110", "K0115", "K0120"];
const EXPECTED_SOURCE_SPEECH_COUNTS = {
  K0110: 11,
  K0115: 3,
  K0120: 3,
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractCampaignMvpAudit(args.root ?? DEFAULT_REPOSITORY_ROOT);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractCampaignMvpAudit(repositoryRoot = DEFAULT_REPOSITORY_ROOT) {
  const context = readAuditContext(repositoryRoot);
  const requirements = [
    auditExecutableAssetReferences(context),
    auditSourceScripts(context),
    auditScenarioImplementation(context),
    auditSimulationCoverage(context),
    auditRuntimeObservation(context),
  ];

  return {
    repositoryRoot,
    summary: {
      requirementCount: requirements.length,
      achievedWithoutRuntimeCount: requirements.filter((requirement) => requirement.status === "achieved-without-runtime").length,
      partialRuntimeCount: requirements.filter((requirement) => requirement.status === "partial-runtime-observation").length,
      missingRuntimeCount: requirements.filter((requirement) => requirement.status === "missing-runtime-observation").length,
      failingEvidenceCount: requirements.flatMap((requirement) => requirement.evidence).filter((item) => !item.present).length,
    },
    requirements,
  };
}

function readAuditContext(repositoryRoot) {
  return {
    executableRefs: extractExecutableReferences(join(repositoryRoot, "original/imjinrok2/imjinrok2.exe")).references,
    sourceScripts: new Map(
      SOURCE_SCRIPT_NAMES.map((scriptName) => [
        scriptName,
        readSourceScript(repositoryRoot, scriptName),
      ]),
    ),
    scenarioSource: readText(repositoryRoot, "packages/shared/src/scenarios.ts"),
    scenarioTests: readText(repositoryRoot, "packages/shared/src/scenarios.test.ts"),
    sourceResultPolicy: readText(repositoryRoot, "packages/simulation/src/k01MissionResultPolicy.ts"),
    sourceResultPolicyTests: readText(repositoryRoot, "packages/simulation/src/k01MissionResultPolicy.test.ts"),
    simulationTests: readText(repositoryRoot, "packages/simulation/src/simulation.test.ts"),
    runtimeNotes: readText(repositoryRoot, ARCHIVED_RUNTIME_NOTES_PATH),
  };
}

function auditExecutableAssetReferences(context) {
  const refs = new Set(context.executableRefs.map((reference) => normalizePath(reference.value)));
  const expectedRefs = [
    "script\\k0120",
    "script\\k0115",
    "script\\k0110",
    "stagemap\\k01.map",
  ];
  const evidence = expectedRefs.map((value) => ({
    id: `exe-ref:${normalizePath(value)}`,
    present: refs.has(normalizePath(value)),
    source: "original/imjinrok2/imjinrok2.exe",
    detail: value,
  }));

  return requirement("original-executable-k01-asset-references", "achieved-without-runtime", evidence);
}

function auditSourceScripts(context) {
  const evidence = SOURCE_SCRIPT_NAMES.map((scriptName) => {
    const script = context.sourceScripts.get(scriptName) ?? "";
    const speechCount = countSourceSpeechLines(script);

    return {
      id: `source-script:${scriptName}`,
      present: speechCount === EXPECTED_SOURCE_SPEECH_COUNTS[scriptName],
      source: `original/imjinrok2/script/${scriptName}`,
      detail: `speechCount=${speechCount}`,
    };
  });

  return requirement("source-script-dialogue-coverage", "achieved-without-runtime", evidence);
}

function auditScenarioImplementation(context) {
  const evidence = [
    ...textEvidence(context.scenarioSource, "packages/shared/src/scenarios.ts", [
      "sourceScript: \"script/K0110\"",
      "sourceScript: \"script/K0115\"",
      "sourceScript: \"script/K0120\"",
      "id: \"build-beacon\"",
      "id: \"withdraw-after-reinforcements\"",
      "id: \"k01-reinforcement-wave\"",
    ]),
    ...textEvidence(context.scenarioTests, "packages/shared/src/scenarios.test.ts", [
      "imjinrok K01 starts with a source-derived established Joseon base",
      "sourceScript === \"script/K0115\"",
      "sourceScript === \"script/K0120\"",
      "protect-ryu-seong-ryong",
      "k01ReinforcementDialogue?.completeScenarioOnEnd, undefined",
      "k01Objectives.get(\"protect-ryu-seong-ryong\")?.defeatDelayTicks, undefined",
      "readSourceSpeechLines(\"K0110\", { includeSpeechSlot: true, includeDelayBefore: true })",
      "readSourceBriefingMetadata(\"K0110\")",
    ]),
    ...textEvidence(context.sourceResultPolicy, "packages/simulation/src/k01MissionResultPolicy.ts", [
      "advanceK01MissionResultPolicy(",
      "clockMilliseconds",
      "completeK01MissionScript(",
    ]),
    ...textEvidence(context.sourceResultPolicyTests, "packages/simulation/src/k01MissionResultPolicy.test.ts", [
      "result clock keeps fractional elapsed time between transport samples",
      "K0120 completion clears source flags and the next boundary owns victory",
      "matured timer commits before beacon and entity updates",
    ]),
  ];

  return requirement("client-scenario-definition-source-parity", "achieved-without-runtime", evidence);
}

function auditSimulationCoverage(context) {
  const evidence = textEvidence(context.simulationTests, "packages/simulation/src/simulation.test.ts", [
    "imjinrok K01 reinforcement preserves its static-proven requested coordinates through an occupied anchor",
    "protect-units objective can delay defeat after a protected unit is lost",
  ]);

  return requirement("simulation-runtime-model-coverage", "achieved-without-runtime", evidence);
}

function auditRuntimeObservation(context) {
  const evidence = [
    {
      id: "vm-note:k01-runtime-breakpoint-capture",
      present: /K01 mission runtime was entered/.test(context.runtimeNotes) &&
        /codex-imjinrok-x32dbg-attach-capture-20260602-0912/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 mission entry, stage-map dispatch, and K0115 opening trigger captured from the original executable",
    },
    {
      id: "vm-note:k01-k0120-forced-runtime-capture",
      present: /codex-imjinrok-k01-memory-base-20260602-0924/.test(context.runtimeNotes) &&
        /observed-k0120-one-shot-set/.test(context.runtimeNotes) &&
        /승리했습니다/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 K0120/victory behavior captured with condition/control-flow-forced original process memory evidence",
    },
    {
      id: "vm-note:k01-defeat-timer-forced-runtime-capture",
      present: /codex-imjinrok-k01-defeat-20260602-0957/.test(context.runtimeNotes) &&
        /observed-k01-defeat-timer-set/.test(context.runtimeNotes) &&
        /delete char/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 defeat timer captured with condition-forced original process memory evidence",
    },
    {
      id: "vm-note:k01-defeat-overlay-forced-runtime-capture",
      present: /codex-imjinrok-k01-defeat-alive-20260602-1010/.test(context.runtimeNotes) &&
        /currentOwnerAliveHeroCheckCount == 0/.test(context.runtimeNotes) &&
        /패배했습니다/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 clean defeat overlay captured with alive-check-word-forced original process memory evidence",
    },
    {
      id: "vm-note:k01-stage-select-ui-callsite-capture",
      present: /codex-imjinrok-k01-launchdebug-stage-20260602-1550/.test(context.runtimeNotes) &&
        /select-stage-border-bind-resource/.test(context.runtimeNotes) &&
        /0x004aafda/.test(context.runtimeNotes) &&
        /yfnt\\\\selectstageborder\.spr/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 menu path captured a live stage-select UI resource-binding call-site from the original executable",
    },
    {
      id: "vm-note:k01-hero-panel-lookup-callsite-capture",
      present: /codex-imjinrok-k01-launchdebug-herodraw-20260602-1533/.test(context.runtimeNotes) &&
        /hero-panel-name-lookup-call/.test(context.runtimeNotes) &&
        /0x004a76d0/.test(context.runtimeNotes) &&
        /0x004a8870/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 menu-to-mission path captured a live hero-panel name lookup call-site from the original executable",
    },
    {
      id: "vm-note:k01-hero-panel-frame-draw-callsite-capture",
      present: /codex-imjinrok-k01-launchdebug-herofinaldraw-20260602-1551/.test(context.runtimeNotes) &&
        /hero-panel-frame-draw-call/.test(context.runtimeNotes) &&
        /0x004a7778/.test(context.runtimeNotes) &&
        /0x0044dfd0/.test(context.runtimeNotes) &&
        /0x04783a86/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 menu-to-mission path captured the live hero-panel frame draw call-site from the original executable",
    },
    {
      id: "vm-note:k01-game-speed-settings-runtime-capture",
      present: /codex-imjinrok-k01-normal-nonhero-20260602-1612/.test(context.runtimeNotes) &&
        /game-speed-draw-entry/.test(context.runtimeNotes) &&
        /0x004ac4c0/.test(context.runtimeNotes) &&
        /game-speed-state-jump-table/.test(context.runtimeNotes) &&
        /0x004ac547/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 live settings flow captured game-speed UI draw/update call-sites from the original executable",
    },
    {
      id: "vm-note:k01-runtime-remaining-gap",
      present: /remaining objective\/progress K01 HUD\/mechanics and natural construction-path\s+observation/.test(context.runtimeNotes),
      source: ARCHIVED_RUNTIME_NOTES_PATH,
      detail: "K01 still needs objective/progress UI/mechanics and natural construction-path runtime captures before full parity",
    },
  ];

  return requirement("original-executable-k01-runtime-observation", "partial-runtime-observation", evidence, [
    "Capture remaining objective/progress K01 HUD/mechanics with QGA notes.",
    "Capture or improve the natural, unforced beacon-construction route if parity claims depend on UI construction timing.",
    "Record the evidence under docs/reverse-engineering before claiming full parity.",
  ]);
}

function requirement(id, status, evidence, remaining = []) {
  return {
    id,
    status: evidence.every((item) => item.present) ? status : "evidence-missing",
    evidence,
    remaining,
  };
}

function textEvidence(sourceText, sourcePath, patterns) {
  return patterns.map((pattern) => ({
    id: `text:${pattern}`,
    present: sourceText.includes(pattern),
    source: sourcePath,
    detail: pattern,
  }));
}

function readSourceScript(repositoryRoot, scriptName) {
  const buffer = readFileSync(join(repositoryRoot, "original/imjinrok2/script", scriptName));

  return new TextDecoder("windows-949").decode(buffer);
}

function readText(repositoryRoot, relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function countSourceSpeechLines(script) {
  return [...script.matchAll(/\[SPEECH\]/g)].length;
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
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
  console.log(`Campaign MVP audit: ${report.repositoryRoot}`);
  console.log(`  requirements: ${report.summary.requirementCount}`);
  console.log(`  achieved without original runtime: ${report.summary.achievedWithoutRuntimeCount}`);
  console.log(`  partial original runtime observations: ${report.summary.partialRuntimeCount}`);
  console.log(`  missing original runtime observations: ${report.summary.missingRuntimeCount}`);
  console.log(`  failing evidence items: ${report.summary.failingEvidenceCount}`);

  for (const requirement of report.requirements) {
    console.log(`  ${requirement.id}: ${requirement.status}`);
    for (const evidence of requirement.evidence.filter((item) => !item.present)) {
      console.log(`    missing ${evidence.source}: ${evidence.detail}`);
    }
  }
}
