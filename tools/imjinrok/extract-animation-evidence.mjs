#!/usr/bin/env node
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";

export const ANIMATION_STATIC_EVIDENCE = [
  {
    id: "draw-unit-type-read",
    category: "draw-path",
    va: 0x0040174c,
    bytes: "0f bf 4e 08",
    meaning: "runtime draw path reads WORD [unit+0x08] as unit type",
  },
  {
    id: "draw-frame-index-read",
    category: "draw-path",
    va: 0x0040179f,
    bytes: "0f bf 56 0a",
    meaning: "runtime draw path reads WORD [unit+0x0a] as per-unit frame index",
  },
  {
    id: "draw-sprite-base-load",
    category: "draw-path",
    va: 0x004017b6,
    bytes: "8b b8 ac cc 88 00",
    meaning: "runtime draw path loads sprite/base pointer from unit type record +0x88ccac",
  },
  {
    id: "draw-frame-pointer-lookup",
    category: "draw-path",
    va: 0x004017bc,
    bytes: "8b 14 8d 78 c5 88 00",
    meaning: "runtime draw path indexes DWORD [0x88c578 + computedFrameIndex*4]",
  },
  {
    id: "draw-frame-base-add",
    category: "draw-path",
    va: 0x004017ca,
    bytes: "03 d7",
    meaning: "runtime draw path adds sprite/base pointer to selected frame pointer",
  },
  {
    id: "draw-call",
    category: "draw-path",
    va: 0x004017e5,
    bytes: "e8 b6 ff 04 00",
    meaning: "runtime draw path calls the frame blit routine at 0x004517a0",
  },
  {
    id: "frame-setter-primary-switch",
    category: "frame-index-setter-candidate",
    va: 0x0041d470,
    bytes: "0f bf 81 e6 01 00 00",
    meaning: "candidate state switch reads WORD [entity+0x1e6]",
  },
  {
    id: "frame-setter-primary-write-a",
    category: "frame-index-setter-candidate",
    va: 0x0041d4b1,
    bytes: "66 89 41 0a",
    meaning: "candidate state path writes WORD [entity+0x0a] from WORD [entity+0x456]",
  },
  {
    id: "frame-setter-primary-write-b",
    category: "frame-index-setter-candidate",
    va: 0x0041d4df,
    bytes: "66 89 41 0a",
    meaning: "candidate state path writes WORD [entity+0x0a] from WORD [entity+0x456]",
  },
  {
    id: "frame-setter-secondary-switch",
    category: "frame-index-setter-candidate",
    va: 0x0041d560,
    bytes: "0f bf 81 e6 01 00 00",
    meaning: "candidate state switch reads WORD [entity+0x1e6]",
  },
  {
    id: "frame-setter-secondary-write-a",
    category: "frame-index-setter-candidate",
    va: 0x0041d5be,
    bytes: "66 89 41 0a",
    meaning: "candidate state path writes WORD [entity+0x0a] from WORD [entity+0x48e]",
  },
  {
    id: "frame-setter-secondary-write-b",
    category: "frame-index-setter-candidate",
    va: 0x0041d5ed,
    bytes: "66 89 41 0a",
    meaning: "candidate state path writes WORD [entity+0x0a] from WORD [entity+0x48e]",
  },
  {
    id: "frame-setter-secondary-write-c",
    category: "frame-index-setter-candidate",
    va: 0x0041d619,
    bytes: "66 89 41 0a",
    meaning: "candidate state path writes WORD [entity+0x0a] from WORD [entity+0x48e]",
  },
  {
    id: "literal-frame-seed-0x6a",
    category: "literal-frame-seed-candidate",
    va: 0x0042c80a,
    bytes: "66 c7 41 0a 6a 00",
    meaning: "candidate mode/state initializer writes frame index 0x006a to WORD [entity+0x0a]",
  },
  {
    id: "literal-frame-seed-0xcc-a",
    category: "literal-frame-seed-candidate",
    va: 0x0042c89b,
    bytes: "66 c7 41 0a cc 00",
    meaning: "candidate mode/state initializer writes frame index 0x00cc to WORD [entity+0x0a]",
  },
  {
    id: "literal-frame-seed-0x6e",
    category: "literal-frame-seed-candidate",
    va: 0x0042c91a,
    bytes: "66 c7 41 0a 6e 00",
    meaning: "candidate mode/state initializer writes frame index 0x006e to WORD [entity+0x0a]",
  },
  {
    id: "literal-frame-seed-0xcc-b",
    category: "literal-frame-seed-candidate",
    va: 0x0042c981,
    bytes: "66 c7 41 0a cc 00",
    meaning: "candidate mode/state initializer writes frame index 0x00cc to WORD [entity+0x0a]",
  },
  {
    id: "action-slot-registration-entry",
    category: "action-slot-registration",
    va: 0x0043a430,
    bytes: "53 55 56 57",
    meaning: "action/command slot registration helper entry, useful context but not direct frame mapping",
  },
  {
    id: "action-slot-registration-write",
    category: "action-slot-registration",
    va: 0x0043a711,
    bytes: "66 89 8c 46 0e 04 00 00",
    meaning: "action/command slot registration writes WORD [entity + slot*2 + 0x40e]",
  },
  {
    id: "frame-debug-format-string",
    category: "built-in-frame-debug-candidate",
    va: 0x004c22b0,
    bytes: "74 79 70 65 3a 25 64 20 66 72 61 6d 65 3a 25 64 00",
    meaning: "built-in ASCII format string 'type:%d frame:%d'",
  },
  {
    id: "frame-debug-format-xref",
    category: "built-in-frame-debug-candidate",
    va: 0x004733ee,
    bytes: "68 b0 22 4c 00",
    meaning: "code pushes the built-in 'type:%d frame:%d' format string before an imported formatting call",
  },
  {
    id: "frame-debug-output-tag-xref",
    category: "built-in-frame-debug-candidate",
    va: 0x0047340a,
    bytes: "68 a0 22 4c 00",
    meaning: "code pushes adjacent 'com:fdsf8ejfd' output tag after formatting the type/frame string",
  },
];

export const DRAW_RUNTIME_BREAKPOINTS = [0x004017bc, 0x0040180e, 0x0040186a, 0x00401968, 0x00401a16];

export const DRAW_RUNTIME_CAPTURE_FIELDS = [
  "esi unit object pointer",
  "WORD [esi+0x08] unit type",
  "WORD [esi+0x0a] source frame index",
  "WORD [esi+0x1e] draw x",
  "WORD [esi+0x20] draw y",
  "BYTE [esi+0x19] draw branch selector",
  "scenario/action context",
];

const args = parseArgs(process.argv.slice(2));

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = extractAnimationStaticEvidence(args.input ?? DEFAULT_EXECUTABLE_PATH);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractAnimationStaticEvidence(executablePath = DEFAULT_EXECUTABLE_PATH) {
  const { buffer, image } = readPeImage(executablePath);
  const evidencePoints = ANIMATION_STATIC_EVIDENCE.map((point) => readEvidencePoint(buffer, image, point));

  return {
    executablePath,
    imageBase: toHex(image.imageBase),
    matched: evidencePoints.every((point) => point.matched),
    evidencePoints,
    runtimeBreakpoints: DRAW_RUNTIME_BREAKPOINTS.map(toHex),
    runtimeCaptureFields: DRAW_RUNTIME_CAPTURE_FIELDS,
  };
}

function readEvidencePoint(buffer, image, point) {
  const rawOffset = image.vaToRawOffset(point.va);
  const expectedBytes = hexToBytes(point.bytes);
  const actualBytes =
    rawOffset === undefined ? Buffer.alloc(0) : buffer.subarray(rawOffset, rawOffset + expectedBytes.length);

  return {
    id: point.id,
    category: point.category,
    va: toHex(point.va),
    rawOffset: rawOffset === undefined ? undefined : toHex(rawOffset),
    expectedBytes: formatBytes(expectedBytes),
    actualBytes: formatBytes(actualBytes),
    matched: Buffer.compare(actualBytes, expectedBytes) === 0,
    meaning: point.meaning,
  };
}

function hexToBytes(hex) {
  return Buffer.from(hex.replaceAll(" ", ""), "hex");
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
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
  console.log(`Original animation evidence: ${report.executablePath}`);
  console.log(`  image base: ${report.imageBase}`);
  console.log(`  all evidence matched: ${report.matched ? "yes" : "no"}`);

  for (const point of report.evidencePoints) {
    console.log(`  ${point.va} ${point.id} ${point.matched ? "matched" : "mismatch"}`);
  }
}
