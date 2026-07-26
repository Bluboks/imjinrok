#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extractUiLayoutStaticEvidence } from "./extract-ui-layout-evidence.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";

const VM_RUNTIME_CONTEXT = {
  qgaWrapper: "/home/bluboks/.local/bin/win10-qga",
  debuggerPath: "C:\\rev\\tools\\x64dbg\\release\\x32\\x32dbg.exe",
  workingCopyLauncher: "C:\\rev\\work\\imjinrok2-ascii\\run-imjinrok2.cmd",
  workingCopyExecutable: "C:\\rev\\work\\imjinrok2-ascii\\imjinrok2.exe",
  safeTargetRoot: "C:\\rev\\target",
  markerPrefix: "codex-imjinrok-ui-trace",
};

const CALL_TARGET_MEANINGS = {
  "0x00442dd0": {
    role: "ui-resource-load-or-bind-candidate",
    capture: [
      "call-site VA",
      "ESP dwords before call",
      "pushed resource path VA/string",
      "resource/cache pointer candidate",
      "destination stack buffer pointer",
    ],
  },
  "0x004434a0": {
    role: "ui-control-copy-or-bind-candidate",
    capture: [
      "call-site VA",
      "ESP dwords before call",
      "stack buffer pointer",
      "destination object field pointer",
      "destination field offset relative to owning object when ESI/EBX is the owner",
    ],
  },
  "0x0044b040": {
    role: "diagnostic-or-assertion-candidate",
    capture: ["call-site VA", "format/control string", "format arguments", "owning UI object pointer"],
  },
  "0x0044abb0": {
    role: "ui-resource-presence-check-candidate",
    capture: ["call-site VA", "resource handle/id argument", "EAX return value", "owning UI object pointer"],
  },
  "0x0044ada0": {
    role: "ui-resource-release-or-unlock-candidate",
    capture: ["call-site VA", "resource handle/id argument", "owning UI object pointer"],
  },
  "0x00443440": {
    role: "ui-resource-destroy-or-free-candidate",
    capture: ["call-site VA", "resource/control table pointer", "owning UI object pointer"],
  },
  "0x0044ae80": {
    role: "ui-resource-rect-query-candidate",
    capture: ["call-site VA", "ESP dwords before call", "output rect pointer candidates", "owning UI object pointer"],
  },
  "0x0044af20": {
    role: "ui-resource-state-query-candidate",
    capture: ["call-site VA", "resource/control state return value", "owning UI object pointer"],
  },
  "0x0044aef0": {
    role: "ui-resource-rect-restore-candidate",
    capture: ["call-site VA", "ESP dwords before call", "rect/state arguments", "owning UI object pointer"],
  },
  "0x0044c8c0": {
    role: "ui-rect-fill-or-clear-candidate",
    capture: ["call-site VA", "ESP dwords before call", "left/top/right/bottom or width/height candidates", "fill/color candidate"],
  },
  "0x0044dfd0": {
    role: "ui-sprite-frame-draw-candidate",
    capture: [
      "call-site VA",
      "ESP dwords before call",
      "resource/frame candidate",
      "left/top/width/height candidates",
      "global table values used immediately before the call",
    ],
  },
  "0x004a8870": {
    role: "hero-name-to-table-index-candidate",
    capture: [
      "call-site VA",
      "ESP dwords before call",
      "hero/control name pointer",
      "returned hero table index in AX",
      "0x00c83e00 table entry comparisons",
    ],
  },
  "0x004a8410": {
    role: "selected-panel-progress-state-candidate",
    capture: [
      "call-site VA",
      "selected slot index argument",
      "selected progress record pointer",
      "progress percent/clamp fields near 0x13c",
    ],
  },
  "0x004a81f0": {
    role: "selected-panel-production-text-candidate",
    capture: [
      "call-site VA",
      "selected slot index argument",
      "text/control object argument",
      "source unit/building name table pointer",
      "computed text and highlight rectangles",
    ],
  },
  "0x004a84e0": {
    role: "selected-panel-slot-dispatch-candidate",
    capture: ["call-site VA", "selected panel object pointer", "surface/global argument", "active slot branch state"],
  },
  "0x004567c0": {
    role: "bottom-panel-text-numeric-candidate",
    capture: ["call-site VA", "bottom panel object pointer", "dirty flag fields", "label/numeric field state"],
  },
  "0x004a2de0": {
    role: "map-control-hit-test-helper-candidate",
    capture: ["call-site VA", "candidate map cell coordinates", "EAX return value", "loop registers"],
  },
  "0x0044e160": {
    role: "ui-sprite-frame-draw-with-extra-argument-candidate",
    capture: ["call-site VA", "ESP dwords before call", "frame table values", "extra argument pointer"],
  },
  "0x0043f560": {
    role: "game-speed-state-apply-candidate",
    capture: ["call-site VA", "current speed index", "derived state value"],
  },
  "0x004119f0": {
    role: "objective-panel-control-state-candidate",
    capture: ["call-site VA", "ESP dwords before call", "control state arguments"],
  },
  "0x00411cb0": {
    role: "objective-panel-visible-state-candidate",
    capture: ["call-site VA", "objective state global", "EAX return value"],
  },
  "0x004492d0": {
    role: "ui-modal-or-blocking-state-candidate",
    capture: ["call-site VA", "EAX return value", "active UI state"],
  },
  "[0x004b722c]": {
    role: "text-format-candidate",
    capture: ["call-site VA", "format string pointer/value", "output buffer pointer", "format arguments"],
  },
  "[0x004b7050]": {
    role: "text-draw-candidate",
    capture: ["call-site VA", "ESP dwords before call", "text pointer", "x/y coordinate candidates", "text length"],
  },
  "[0x004b7058]": {
    role: "text-measure-candidate",
    capture: ["call-site VA", "ESP dwords before call", "text pointer", "text length", "output size pointer"],
  },
  "[0x004b716c]": {
    role: "text-length-candidate",
    capture: ["call-site VA", "text pointer", "returned length"],
  },
  "[0x004b7054]": {
    role: "text-font-or-context-select-candidate",
    capture: ["call-site VA", "surface/context pointer", "font or style handle candidate"],
  },
  "[0x004b7044]": {
    role: "text-foreground-color-candidate",
    capture: ["call-site VA", "surface/context pointer", "RGB/color argument"],
  },
  "[0x004b7048]": {
    role: "text-background-or-shadow-color-candidate",
    capture: ["call-site VA", "surface/context pointer", "RGB/color argument"],
  },
  "[0x004b704c]": {
    role: "text-output-mode-candidate",
    capture: ["call-site VA", "surface/context pointer", "mode argument"],
  },
  "[ecx+0x00000044]": {
    role: "surface-context-acquire-candidate",
    capture: ["call-site VA", "surface object pointer", "output context pointer"],
  },
  "[edx+0x00000068]": {
    role: "surface-present-or-release-candidate",
    capture: ["call-site VA", "surface object pointer", "context pointer", "presented rectangle candidates"],
  },
  "[ecx+0x00000068]": {
    role: "surface-present-or-release-candidate",
    capture: ["call-site VA", "surface object pointer", "context pointer", "presented rectangle candidates"],
  },
  "[esi+0x0000001c]": {
    role: "bottom-panel-final-blit-candidate",
    capture: ["call-site VA", "main surface pointer", "cached bottom-panel surface pointer", "blit rectangle arguments"],
  },
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = buildUiRuntimeTracePlan(args.input ?? DEFAULT_EXECUTABLE_PATH);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function buildUiRuntimeTracePlan(executablePath = DEFAULT_EXECUTABLE_PATH) {
  const staticEvidence = extractUiLayoutStaticEvidence(executablePath);
  const breakpoints = [];
  const candidateConstants = [];

  for (const probe of staticEvidence.probes) {
    for (const callTarget of probe.callTargets) {
      breakpoints.push(buildCallsiteBreakpoint(probe, callTarget));
    }

    if (probe.includeCandidateConstants !== false) {
      for (const stackWrite of probe.stackWrites) {
        candidateConstants.push({
          probeId: probe.id,
          source: "stack-write",
          va: stackWrite.va,
          stackOffset: stackWrite.stackOffset,
          value: stackWrite.immediate,
          followUp: "Trace the following resource/control bind call to identify the stack-buffer structure.",
        });
      }

      for (const comparison of probe.comparisons) {
        candidateConstants.push({
          probeId: probe.id,
          source: "comparison",
          va: comparison.va,
          register: comparison.register,
          value: comparison.immediate,
          followUp: "Trace nearby loop state to determine whether this is a count, index limit, or hit-test bound.",
        });
      }
    }
  }

  return {
    executablePath,
    executableSha256: sha256File(executablePath),
    vm: VM_RUNTIME_CONTEXT,
    scope: {
      goal: "Confirm which UI static-probe values become original runtime layout coordinates, dimensions, or hit-test bounds.",
      allowedFlow:
        "Use the ASCII working-copy launcher, stay in single-player menu/scenario flow, and avoid multiplayer/network paths.",
      cleanup: `After each run, call ${VM_RUNTIME_CONTEXT.qgaWrapper} cleanup <marker> for the marker used in that run.`,
    },
    breakpoints,
    candidateConstants,
    manualTraceSequence: [
      "Confirm no existing codex-imjinrok marker process is running.",
      "Launch the working copy with a fresh marker derived from vm.markerPrefix.",
      "Attach x32dbg to the imjinrok2 process or launch the working-copy executable under x32dbg.",
      "Set breakpoints at the call-site VAs in this plan, not only at shared callee entry points.",
      "Navigate only the single-player scenario path through the menu and country/stage selection screens.",
      "For every hit, record registers, top ESP dwords, decoded ASCII pointers, and any pointed buffer/object fields.",
      "Clean up the marked process immediately after capture.",
    ],
  };
}

function buildCallsiteBreakpoint(probe, callTarget) {
  const targetMeaning = CALL_TARGET_MEANINGS[callTarget.target] ?? {
    role: "unknown-call-target",
    capture: ["call-site VA", "registers", "ESP dwords before call"],
  };
  const callsiteContext = probe.callsiteContexts.find((context) => context.callVa === callTarget.va);

  return {
    id: `${probe.id}:${callTarget.va}->${callTarget.target}`,
    probeId: probe.id,
    category: probe.category,
    address: callTarget.va,
    callTarget: callTarget.target,
    role: targetMeaning.role,
    staticContext: {
      probeRange: `${probe.startVa}-${probe.endVa}`,
      pushedStrings: uniqueStrings(probe.pushStrings.map((event) => event.string)),
      fieldOffsets: uniqueStrings(probe.fieldRefs.map((event) => event.fieldOffset)),
      preCallPushes: callsiteContext?.preCallPushes ?? [],
      preCallStackWrites: callsiteContext?.preCallStackWrites ?? [],
      preCallStackWordWrites: callsiteContext?.preCallStackWordWrites ?? [],
      preCallFieldRefs: callsiteContext?.preCallFieldRefs ?? [],
      preCallGlobalRefs: callsiteContext?.preCallGlobalRefs ?? [],
      preCallIndexedGlobalRefs: callsiteContext?.preCallIndexedGlobalRefs ?? [],
      preCallRegisterDisplacementRefs: callsiteContext?.preCallRegisterDisplacementRefs ?? [],
      preCallComparisons: callsiteContext?.preCallComparisons ?? [],
    },
    capture: [
      "EAX",
      "EBX",
      "ECX",
      "EDX",
      "ESI",
      "EDI",
      "EBP",
      "ESP",
      ...targetMeaning.capture,
    ],
  };
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
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
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printReport(report) {
  console.log(`Original UI runtime trace plan: ${report.executablePath}`);
  console.log(`  sha256: ${report.executableSha256}`);
  console.log(`  debugger: ${report.vm.debuggerPath}`);
  console.log(`  launcher: ${report.vm.workingCopyLauncher}`);
  console.log(`  marker prefix: ${report.vm.markerPrefix}`);

  for (const breakpoint of report.breakpoints) {
    console.log(`  ${breakpoint.address} ${breakpoint.probeId} -> ${breakpoint.callTarget} ${breakpoint.role}`);
    const contextSummary = summarizeStaticContext(breakpoint.staticContext);
    if (contextSummary) {
      console.log(`    pre-call: ${contextSummary}`);
    }
  }

  for (const constant of report.candidateConstants) {
    console.log(`  candidate ${constant.va} ${constant.source} ${constant.value}`);
  }
}

function summarizeStaticContext(staticContext) {
  const parts = [];
  const pushes = (staticContext.preCallPushes ?? []).map((event) => event.string ?? event.immediate);
  if (pushes.length > 0) {
    parts.push(`push ${pushes.join(",")}`);
  }

  const stackWrites = (staticContext.preCallStackWrites ?? []).map((event) => `${event.stackOffset}=${event.immediate}`);
  if (stackWrites.length > 0) {
    parts.push(`stack ${stackWrites.join(",")}`);
  }

  const stackWordWrites = (staticContext.preCallStackWordWrites ?? []).map((event) => `${event.stackOffset}=${event.immediate}`);
  if (stackWordWrites.length > 0) {
    parts.push(`stack16 ${stackWordWrites.join(",")}`);
  }

  const fields = (staticContext.preCallFieldRefs ?? []).map((event) => `${event.baseRegister}+${event.fieldOffset}`);
  if (fields.length > 0) {
    parts.push(`fields ${fields.join(",")}`);
  }

  const globals = (staticContext.preCallGlobalRefs ?? []).map((event) => `${event.operation}:${event.address}`);
  if (globals.length > 0) {
    parts.push(`globals ${globals.join(",")}`);
  }

  const indexedGlobals = (staticContext.preCallIndexedGlobalRefs ?? []).map(
    (event) => `${event.register}=[${event.indexRegister}*${event.scale}+${event.address}]`,
  );
  if (indexedGlobals.length > 0) {
    parts.push(`indexed ${indexedGlobals.join(",")}`);
  }

  const registerDisplacements = (staticContext.preCallRegisterDisplacementRefs ?? []).map(
    (event) => `${event.register}=[${event.baseRegister}+${event.displacement}]`,
  );
  if (registerDisplacements.length > 0) {
    parts.push(`base+disp ${registerDisplacements.join(",")}`);
  }

  const comparisons = (staticContext.preCallComparisons ?? []).map((event) => `${event.register}==${event.immediate}`);
  if (comparisons.length > 0) {
    parts.push(`cmp ${comparisons.join(",")}`);
  }

  return parts.join("; ");
}
