#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extractExecutableReferences } from "./extract-executable-refs.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const DEFAULT_MISSION_SCOPE = "K01";
const VALID_MISSION_SCOPES = new Set(["K01", "K02", "all"]);

const VM_RUNTIME_CONTEXT = {
  qgaWrapper: "/home/bluboks/.local/bin/win10-qga",
  debuggerPath: "C:\\rev\\tools\\x64dbg\\release\\x32\\x32dbg.exe",
  debuggerHeadlessPath: "C:\\rev\\tools\\x64dbg\\release\\x32\\headless.exe",
  guiTargetLauncher: "C:\\rev\\work\\run-campaign-x32dbg-target-launch.ps1",
  guiCommandSequenceHelper: "C:\\rev\\work\\send-x32dbg-command-sequence.ps1",
  markerCleanupHelper: "C:\\rev\\work\\cleanup-codex-marker-processes.ps1",
  campaignSetupScript: "C:\\rev\\work\\codex-imjinrok-campaign-setup.xdbg",
  workingCopyLauncher: "C:\\rev\\work\\imjinrok2-ascii\\run-imjinrok2.cmd",
  workingCopyExecutable: "C:\\rev\\work\\imjinrok2-ascii\\imjinrok2.exe",
  markerPrefix: "codex-imjinrok-campaign-trace",
};

const SCRIPT_ENGINE_CALL_TARGETS = {
  "0x004823a0": "script-engine-busy-or-active-check",
  "0x00482180": "script-load-or-queue-candidate",
  "0x00482340": "script-start-or-commit-candidate",
};

const SCRIPT_EVENT_PROBES = [
  {
    id: "k01-opening-dialogue-k0115",
    mission: "K01",
    sourceScript: "script\\k0115",
    scriptPushVa: 0x0048a6cf,
    meaning: "K01 early runtime dialogue trigger after mission start.",
    preconditionBreakpoints: [
      { address: 0x0048a6bd, role: "script-engine-ready-check-before-k0115" },
      { address: 0x0048a6c6, role: "mission-tick-or-phase-guard-before-k0115" },
    ],
  },
  {
    id: "k01-beacon-reinforcement-dialogue-k0120",
    mission: "K01",
    sourceScript: "script\\k0120",
    scriptPushVa: 0x0048a78a,
    meaning: "K01 reinforcement/retreat dialogue trigger guarded by unit scan and beacon-related conditions.",
    preconditionBreakpoints: [
      { address: 0x0048a74f, role: "k01-unit-scan-loop-entry" },
      { address: 0x0048a75c, role: "k01-unit-owner-or-type-condition" },
      { address: 0x0048a76a, role: "k01-unit-type-immediate-0x34-condition" },
      { address: 0x0048a76f, role: "k01-unit-state-immediate-0x64-condition" },
      { address: 0x0048a781, role: "script-engine-ready-check-before-k0120" },
    ],
    postconditionBreakpoints: [
      { address: 0x0048a7ae, role: "k01-k0120-world-effect-or-spawn-call" },
      { address: 0x0048a7b9, role: "k01-k0120-camera-or-map-focus-call" },
      { address: 0x0048a7c7, role: "k01-k0120-retreat-state-call" },
      { address: 0x0048a7d5, role: "k01-k0120-retreat-order-or-marker-call" },
    ],
  },
  {
    id: "k02-opening-dialogue-k0220",
    mission: "K02",
    sourceScript: "script\\k0220",
    scriptPushVa: 0x0048a922,
    meaning: "K02 early runtime dialogue trigger after mission start.",
    preconditionBreakpoints: [
      { address: 0x0048a910, role: "script-engine-ready-check-before-k0220" },
      { address: 0x0048a919, role: "mission-tick-or-phase-guard-before-k0220" },
    ],
  },
  {
    id: "k02-hanseong-occupation-dialogue-k0225",
    mission: "K02",
    sourceScript: "script\\k0225",
    scriptPushVa: 0x0048a990,
    meaning: "K02 Hanseong occupation/pursuit dialogue trigger.",
    preconditionBreakpoints: [
      { address: 0x0048a955, role: "k02-area-or-objective-check-before-k0225" },
      { address: 0x0048a976, role: "k02-k0225-one-shot-flag-write" },
      { address: 0x0048a987, role: "script-engine-ready-check-before-k0225" },
    ],
  },
  {
    id: "k02-gwon-yul-rendezvous-dialogue-k0227",
    mission: "K02",
    sourceScript: "script\\k0227",
    scriptPushVa: 0x0048ab52,
    meaning: "K02 Gwon Yul rendezvous dialogue trigger guarded by area checks.",
    preconditionBreakpoints: [
      { address: 0x0048ab19, role: "k02-rendezvous-area-check-before-k0227" },
      { address: 0x0048ab38, role: "k02-k0227-one-shot-flag-write" },
      { address: 0x0048ab49, role: "script-engine-ready-check-before-k0227" },
    ],
  },
  {
    id: "k02-pyongyang-arrival-dialogue-k0230",
    mission: "K02",
    sourceScript: "script\\k0230",
    scriptPushVa: 0x0048ace1,
    meaning: "K02 Pyongyang arrival/victory dialogue trigger.",
    preconditionBreakpoints: [
      { address: 0x0048acc0, role: "k02-arrival-area-or-objective-check-before-k0230" },
      { address: 0x0048acd1, role: "k02-k0230-one-shot-flag-write" },
      { address: 0x0048acd8, role: "script-engine-ready-check-before-k0230" },
    ],
  },
];

const MISSION_RESOURCE_PROBES = [
  {
    id: "k01-initial-script-copy-k0110",
    mission: "K01",
    resource: "script\\k0110",
    address: 0x0048d049,
    xrefVa: 0x0048d04a,
    role: "campaign-initial-script-copy-source",
    meaning: "Copies K01 initial briefing/runtime script path into a campaign resource block.",
  },
  {
    id: "k02-initial-script-copy-k0210",
    mission: "K02",
    resource: "script\\k0210",
    address: 0x0048d071,
    xrefVa: 0x0048d072,
    role: "campaign-initial-script-copy-source",
    meaning: "Copies K02 initial briefing/runtime script path into a campaign resource block.",
  },
  {
    id: "k01-stage-map-copy",
    mission: "K01",
    resource: "stagemap\\k01.map",
    address: 0x0048d740,
    xrefVa: 0x0048d745,
    role: "stage-map-copy-function-entry",
    meaning: "Copies the K01 stage map path into the caller-provided buffer.",
  },
  {
    id: "k02-stage-map-copy",
    mission: "K02",
    resource: "stagemap\\k02.map",
    address: 0x0048d770,
    xrefVa: 0x0048d775,
    role: "stage-map-copy-function-entry",
    meaning: "Copies the K02 stage map path into the caller-provided buffer.",
  },
];

const DISPATCHER_PROBES = [
  {
    id: "campaign-stage-map-dispatcher",
    address: 0x0048d410,
    role: "campaign-stage-map-dispatcher-entry",
    capture: ["stage selector argument at [ESP+4]", "ECX destination buffer pointer", "EAX switch index"],
  },
  {
    id: "campaign-stage-map-dispatch-k01",
    mission: "K01",
    address: 0x0048d429,
    role: "dispatcher-call-k01-stage-map-copy",
    capture: ["stage selector argument", "destination buffer before/after call", "returned K01 map path"],
  },
  {
    id: "campaign-stage-map-dispatch-k02",
    mission: "K02",
    address: 0x0048d435,
    role: "dispatcher-call-k02-stage-map-copy",
    capture: ["stage selector argument", "destination buffer before/after call", "returned K02 map path"],
  },
];

const WORLD_EFFECT_PROBES = [
  {
    id: "k02-midcourse-rain-effect",
    mission: "K02",
    address: 0x0048aad2,
    role: "k02-rain-or-weather-effect-callsite",
    meaning: "Static K02 weather/effect call-site currently mirrored as exe/K02@0x48aad2 in the MVP scenario.",
    capture: ["EAX", "ECX", "EDX", "EDI", "ESP dwords before call 0x00488160", "effect id arguments"],
  },
];

const WATCHED_GLOBALS = [
  { address: "0x007c5f80", role: "mission tick or phase counter candidate" },
  { address: "0x008438dc", role: "K01 K0120 one-shot flag candidate" },
  { address: "0x008438de", role: "selected unit/object index candidate used by K02 triggers" },
  { address: "0x008438e2", role: "K02 K0225 one-shot flag candidate" },
  { address: "0x008438e4", role: "K02 weather/effect one-shot flag candidate" },
  { address: "0x008438e6", role: "K02 K0227 one-shot flag candidate" },
  { address: "0x008438e8", role: "K02 K0230 one-shot flag candidate" },
  { address: "0x00882e04", role: "global runtime tick/time source candidate" },
  { address: "0x00bcbe08", role: "script engine object used by campaign script calls" },
  { address: "0x0063540e", role: "unit table base candidate used by campaign scans" },
  { address: "0x00ac2d90", role: "map width or x-bound candidate" },
  { address: "0x00ac2d94", role: "map height or y-bound candidate" },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildCampaignRuntimeTracePlan(args.input ?? DEFAULT_EXECUTABLE_PATH, {
    mission: args.mission ?? DEFAULT_MISSION_SCOPE,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function buildCampaignRuntimeTracePlan(executablePath = DEFAULT_EXECUTABLE_PATH, options = {}) {
  const missionScope = normalizeMissionScope(options.mission ?? DEFAULT_MISSION_SCOPE);
  const { buffer, image } = readPeImage(executablePath);
  const references = extractExecutableReferences(executablePath).references;
  const referenceByValue = new Map(references.map((reference) => [normalizePath(reference.value), reference]));
  const scriptEvents = filterMissionScoped(SCRIPT_EVENT_PROBES, missionScope)
    .map((probe) => buildScriptEvent(buffer, image, referenceByValue, probe));
  const missionResources = filterMissionScoped(MISSION_RESOURCE_PROBES, missionScope)
    .map((probe) => buildResourceProbe(referenceByValue, probe));
  const dispatcherBreakpoints = filterMissionScoped(DISPATCHER_PROBES, missionScope).map(normalizeBreakpointAddress);
  const worldEffectBreakpoints = filterMissionScoped(WORLD_EFFECT_PROBES, missionScope).map(normalizeBreakpointAddress);
  const watchedGlobals = filterWatchedGlobals(WATCHED_GLOBALS, missionScope);

  return {
    executablePath,
    executableSha256: sha256File(executablePath),
    vm: VM_RUNTIME_CONTEXT,
    scope: {
      mission: missionScope,
      goal: missionScope === "all"
        ? "Capture original executable K01 mission runtime behavior, with K02 probes retained only as optional follow-up evidence."
        : `Capture original executable ${missionScope} mission runtime behavior before claiming campaign parity.`,
      allowedFlow: missionScope === "all"
        ? "Use the ASCII working copy, stay in single-player Joseon K01 flow first; enter K02 only for explicit optional follow-up captures."
        : `Use the ASCII working copy, stay in single-player Joseon ${missionScope} flow, and avoid multiplayer/network paths.`,
      cleanup: `${VM_RUNTIME_CONTEXT.qgaWrapper} cleanup <marker> after every launched run; do not clean other agents' processes.`,
    },
    scriptEngineCallTargets: SCRIPT_ENGINE_CALL_TARGETS,
    watchedGlobals,
    scriptEvents,
    missionResources,
    dispatcherBreakpoints,
    worldEffectBreakpoints,
    breakpoints: [
      ...scriptEvents.flatMap((event) => event.breakpoints),
      ...missionResources.map((resource) => resource.breakpoint),
      ...dispatcherBreakpoints,
      ...worldEffectBreakpoints,
    ],
    manualTraceSequence: [
      "Confirm no existing codex-imjinrok process is running with the wrapper ps subcommand.",
      "Launch the game or debugger with a fresh marker derived from vm.markerPrefix.",
      "Prefer interactive x32dbg for the next capture attempt; close or suppress its Release Notes dialog before scripted commands.",
      "Use scriptexec through vm.guiCommandSequenceHelper to load the generated breakpoint setup script.",
      missionScope === "all"
        ? "Enter single-player Joseon K01 using the original working-copy executable; continue into K02 only for explicit optional follow-up captures."
        : `Enter single-player Joseon ${missionScope}, using the original working-copy executable.`,
      missionScope === "all"
        ? "Trace stage map dispatcher/copy breakpoints to confirm K01 map selection first; K02 map selection is optional follow-up evidence."
        : `Trace stage map dispatcher/copy breakpoints to confirm ${missionScope} map selection and destination buffers.`,
      "Trace script event call-sites to capture trigger guard state, pushed script path, and script engine return values.",
      "For each hit, record registers, ESP dwords, watched globals, decoded path buffers, and the current mission state.",
      "Clean up the marked process immediately after each capture and verify no marker process remains.",
    ],
  };
}

function normalizeMissionScope(value) {
  const mission = String(value).toUpperCase();
  if (!VALID_MISSION_SCOPES.has(mission) && mission !== "ALL") {
    throw new Error(`Invalid mission scope: ${value}`);
  }

  return mission === "ALL" ? "all" : mission;
}

function filterMissionScoped(entries, missionScope) {
  if (missionScope === "all") {
    return entries;
  }

  return entries.filter((entry) => !entry.mission || entry.mission === missionScope);
}

function filterWatchedGlobals(globals, missionScope) {
  if (missionScope === "all") {
    return globals;
  }

  return globals.filter((entry) => !entry.role.includes("K02"));
}

function normalizeBreakpointAddress(breakpoint) {
  return {
    ...breakpoint,
    address: typeof breakpoint.address === "number" ? toHex(breakpoint.address) : breakpoint.address,
  };
}

function buildScriptEvent(buffer, image, referenceByValue, probe) {
  const reference = requireReference(referenceByValue, probe.sourceScript);
  const pushSite = requireXref(reference, probe.scriptPushVa, "push-imm32");
  const windowEvents = scanCodeWindow(buffer, image, probe.scriptPushVa - 0x40, probe.scriptPushVa + 0x40);
  const afterPushCalls = windowEvents
    .filter((event) => event.kind === "call-rel32" && parseHex(event.va) > probe.scriptPushVa)
    .slice(0, 2);

  return {
    ...probe,
    sourceScriptVa: reference.va,
    sourceScriptRawOffset: reference.rawOffset,
    pushSite,
    nearbyCalls: windowEvents.filter((event) => event.kind === "call-rel32"),
    inferredScriptEngineCalls: afterPushCalls.map((event, index) => ({
      ...event,
      inferredRole:
        SCRIPT_ENGINE_CALL_TARGETS[event.target] ?? (index === 0 ? "script-load-call-candidate" : "script-start-call-candidate"),
    })),
    breakpoints: [
      ...probe.preconditionBreakpoints.map((breakpoint) => buildBreakpoint(probe, breakpoint.address, breakpoint.role)),
      buildBreakpoint(probe, probe.scriptPushVa, "script-path-push"),
      ...afterPushCalls.map((event) => buildBreakpoint(probe, parseHex(event.va), SCRIPT_ENGINE_CALL_TARGETS[event.target] ?? "script-engine-call")),
      ...(probe.postconditionBreakpoints ?? []).map((breakpoint) => buildBreakpoint(probe, breakpoint.address, breakpoint.role)),
    ],
  };
}

function buildResourceProbe(referenceByValue, probe) {
  const reference = requireReference(referenceByValue, probe.resource);
  const xref = requireXref(reference, probe.xrefVa);

  return {
    ...probe,
    resourceVa: reference.va,
    resourceRawOffset: reference.rawOffset,
    xref,
    breakpoint: {
      id: probe.id,
      mission: probe.mission,
      address: toHex(probe.address),
      role: probe.role,
      capture: [
        "EAX",
        "ECX",
        "EDX",
        "ESI",
        "EDI",
        "ESP",
        "destination buffer pointer",
        "decoded resource path after copy",
      ],
    },
  };
}

function buildBreakpoint(probe, address, role) {
  return {
    id: `${probe.id}:${toHex(address)}`,
    mission: probe.mission,
    address: toHex(address),
    role,
    sourceScript: probe.sourceScript,
    capture: [
      "EAX",
      "EBX",
      "ECX",
      "EDX",
      "ESI",
      "EDI",
      "EBP",
      "ESP",
      "top ESP dwords",
      "watched globals relevant to this mission",
      "decoded source script path when a pointer targets .data",
    ],
  };
}

function scanCodeWindow(buffer, image, startVa, endVa) {
  const startRawOffset = image.vaToRawOffset(startVa);
  const endRawOffset = image.vaToRawOffset(endVa);
  if (startRawOffset === undefined || endRawOffset === undefined) {
    throw new Error(`Scan range is outside the executable image: ${toHex(startVa)}-${toHex(endVa)}`);
  }

  const events = [];

  for (let rawOffset = startRawOffset; rawOffset < endRawOffset; rawOffset += 1) {
    const va = image.rawOffsetToVa(rawOffset);
    const byte = buffer[rawOffset];

    if (byte === 0x68 && rawOffset + 5 <= endRawOffset) {
      events.push({
        kind: "push-imm32",
        va: toHex(va),
        immediate: toHex(buffer.readUInt32LE(rawOffset + 1)),
      });
      rawOffset += 4;
      continue;
    }

    if (byte === 0xe8 && rawOffset + 5 <= endRawOffset) {
      events.push({
        kind: "call-rel32",
        va: toHex(va),
        target: toHex(va + 5 + buffer.readInt32LE(rawOffset + 1)),
      });
      rawOffset += 4;
    }
  }

  return events;
}

function requireReference(referenceByValue, value) {
  const reference = referenceByValue.get(normalizePath(value));
  if (!reference) {
    throw new Error(`Missing executable reference: ${value}`);
  }
  return reference;
}

function requireXref(reference, instructionVa, kind) {
  const xref = reference.xrefs.find(
    (candidate) =>
      parseHex(candidate.instructionVa) === instructionVa && (!kind || candidate.kind === kind),
  );
  if (!xref) {
    throw new Error(`Missing xref for ${reference.value} at ${toHex(instructionVa)}`);
  }
  return xref;
}

function parseHex(value) {
  if (typeof value === "number") {
    return value;
  }
  return Number.parseInt(value, 16);
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--mission") {
      parsed.mission = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printReport(report) {
  console.log(`Original campaign runtime trace plan: ${report.executablePath}`);
  console.log(`  sha256: ${report.executableSha256}`);
  console.log(`  debugger: ${report.vm.debuggerPath}`);
  console.log(`  launcher: ${report.vm.workingCopyLauncher}`);
  console.log(`  marker prefix: ${report.vm.markerPrefix}`);
  console.log(`  mission scope: ${report.scope.mission}`);

  for (const event of report.scriptEvents) {
    console.log(`  ${event.id} ${event.sourceScript} push=${toHex(event.scriptPushVa)}`);
    for (const call of event.inferredScriptEngineCalls) {
      console.log(`    call ${call.va} -> ${call.target} ${call.inferredRole}`);
    }
  }

  for (const resource of report.missionResources) {
    console.log(`  ${resource.id} ${resource.resource} at ${toHex(resource.address)}`);
  }
}
