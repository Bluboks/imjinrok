#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readPeImage, toHex } from "./pe-image.mjs";

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";

const QUESTION =
  "For standard K01 mission entry, which exact call chain resets DWORD 0x0084373c/0x00843740, how does FUN_00460ba0's zero fill cover both timer addresses before the stage-1 K01 map initializer runs, and what are the exact range/boundary/order semantics?";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const DEFAULT_PATHS = {
  input: resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
  manifest: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/manifest.json",
  ),
  seeds: resolve(repositoryRoot, "analysis/generated/imjinrok2/seeds.json"),
  functions: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/functions.json",
  ),
  references: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/references.json",
  ),
  strings: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/strings.json",
  ),
  jumpTables: resolve(
    repositoryRoot,
    "analysis/generated/imjinrok2/jump-tables.json",
  ),
};

export const ZERO_FILL = Object.freeze({
  startAddress: 0x007c5ed8,
  dwordCount: 0x0001f6aa,
  byteLength: 0x0007daa8,
  endExclusive: 0x00843980,
});

const TRACKED_ADDRESSES = Object.freeze([
  {
    id: "active-count",
    address: 0x00843738,
    offset: 0x0007d860,
    dwordIndex: 0x0001f618,
  },
  {
    id: "win-timer",
    address: 0x0084373c,
    offset: 0x0007d864,
    dwordIndex: 0x0001f619,
  },
  {
    id: "loss-timer",
    address: 0x00843740,
    offset: 0x0007d868,
    dwordIndex: 0x0001f61a,
  },
  {
    id: "nearby-0x00843744",
    address: 0x00843744,
    offset: 0x0007d86c,
    dwordIndex: 0x0001f61b,
  },
  {
    id: "nearby-0x00843748",
    address: 0x00843748,
    offset: 0x0007d870,
    dwordIndex: 0x0001f61c,
  },
  {
    id: "k01-trigger-flag-containing-dword",
    address: 0x008438dc,
    offset: 0x0007da04,
    dwordIndex: 0x0001f681,
  },
]);

const EXPECTED_FUNCTIONS = new Map([
  [
    0x0045f9c0,
    [
      "0x0045f9c0-0x004607ac",
      801,
      209,
      "b694ee213a1b5f189ed7455e00690dcb29d970eca6ea87ef1f59c42c611cfb24",
    ],
  ],
  [
    0x00460ba0,
    [
      "0x00460ba0-0x00460e20",
      144,
      17,
      "248c49519c1c692efde84ee3aac2159912097dca7ed46fe3f93ab7b7048b748e",
    ],
  ],
  [
    0x0048dbe0,
    [
      "0x0048dbe0-0x0048dda9",
      147,
      21,
      "f38e4577cf36c44f26097d94e200321d2a9bc6b0aa1696d572e40a600e7f7217",
    ],
  ],
  [
    0x0048d410,
    [
      "0x0048d410-0x0048d594",
      110,
      31,
      "55e9e403f208ea2de9f779cb5176d11db85b33758a30d2310d14504dabd0c13d",
    ],
  ],
  [
    0x0048d740,
    [
      "0x0048d740-0x0048d768",
      20,
      1,
      "9cb35ae658845161b05e2ea647d46fd8a70b410856ae056859458c0015ff235e",
    ],
  ],
]);

const REQUIRED_SEEDS = [
  [0x00460baf, "mission-session-zero-fill", 0x00460ba0],
  [0x0048dbe4, "mission-entry-reset-base", 0x0048dbe0],
  [0x0048d42b, "k01-stage-map-dispatch", 0x0048d410],
  [0x0048d744, "k01-stage-map-source-copy", 0x0048d740],
];

const REQUIRED_CALL_EDGES = [
  [0x004600cb, 0x0045f9c0, 0x00445770],
  [0x004600d0, 0x0045f9c0, 0x0048dbe0],
  [0x004600d5, 0x0045f9c0, 0x004457d0],
  [0x0048dbe9, 0x0048dbe0, 0x00460ba0],
  [0x0048dc6d, 0x0048dbe0, 0x0048d410],
  [0x0048d42b, 0x0048d410, 0x0048d740],
];

const REQUIRED_INSTRUCTIONS = [
  [0x00460ba3, 0x00460ba0, "MOV ESI,ECX"],
  [0x00460ba6, 0x00460ba0, "MOV ECX,0x1f6aa"],
  [0x00460bab, 0x00460ba0, "XOR EAX,EAX"],
  [0x00460bad, 0x00460ba0, "MOV EDI,ESI"],
  [0x00460baf, 0x00460ba0, "STOSD.REP ES:EDI"],
  [0x0048dbe4, 0x0048dbe0, "MOV ECX,0x7c5ed8"],
  [0x0048dc4c, 0x0048dbe0, "MOV AX,[0x0088afcc]"],
  [0x0048dc5b, 0x0048dbe0, "PUSH EAX"],
  [0x0048dc68, 0x0048dbe0, "MOV ECX,0xabf068"],
  [0x0048d744, 0x0048d740, "MOV EDI,0x4c31c8"],
  [0x0048d74e, 0x0048d740, "SCASB.REPNE ES:EDI"],
];

const CODE_ANCHORS = [
  {
    id: "main-state-minus-one-switch",
    va: 0x0045fd4c,
    bytes: "48 83 f8 22 0f 87 32 ff ff ff ff 24 85 b0 07 46 00",
  },
  {
    id: "state-one-entry-call-order",
    va: 0x004600cb,
    bytes:
      "e8 a0 56 fe ff e8 0b db 02 00 e8 f6 56 fe ff 66 89 3d c8 df 4b 00",
  },
  {
    id: "mission-session-dword-zero-fill",
    va: 0x00460ba3,
    bytes:
      "8b f1 57 b9 aa f6 01 00 33 c0 8b fe f3 ab",
  },
  {
    id: "mission-entry-reset-base-and-call",
    va: 0x0048dbe4,
    bytes: "b9 d8 5e 7c 00 e8 b2 2f fd ff",
  },
  {
    id: "stage-read-push-destination-and-dispatch",
    va: 0x0048dc4c,
    bytes:
      "66 a1 cc af 88 00 8b d1 8b f7 bf b0 cd c5 00 50 c1 e9 02 f3 a5 8b ca 83 e1 03 f3 a4 b9 68 f0 ab 00 e8 9e f7 ff ff",
  },
  {
    id: "stage-one-jump-case-calls-k01-copy",
    va: 0x0048d410,
    bytes:
      "0f bf 44 24 04 48 56 83 f8 1b 8b f1 0f 87 f8 00 00 00 ff 24 85 98 d5 48 00 8b ce e8 10 03 00 00",
  },
  {
    id: "k01-map-nul-terminated-source-copy",
    va: 0x0048d740,
    bytes:
      "56 8b d1 57 bf c8 31 4c 00 83 c9 ff 33 c0 f2 ae f7 d1 2b f9 8b c1 8b f7 8b fa c1 e9 02 f3 a5 8b c8 83 e1 03 f3 a4 5f 5e c3",
  },
];

const TIMER_REFERENCE_EXPECTATIONS = [
  {
    id: "win-timer",
    address: "0x0084373c",
    total: 20,
    writes: 9,
  },
  {
    id: "loss-timer",
    address: "0x00843740",
    total: 70,
    writes: 33,
  },
];

const ZERO_FILL_FUNCTIONS = new Set([
  "0x0045f9c0",
  "0x00460ba0",
  "0x0048dbe0",
  "0x0048d410",
  "0x0048d740",
]);

export function describeDwordZeroFill({
  startAddress = ZERO_FILL.startAddress,
  dwordCount = ZERO_FILL.dwordCount,
} = {}) {
  validateUnsigned32(startAddress, "startAddress");
  validateUnsigned32(dwordCount, "dwordCount");
  if (startAddress % 4 !== 0) {
    throw new RangeError(
      `startAddress must be DWORD-aligned; got ${toHex(startAddress)}`,
    );
  }
  const byteLength = dwordCount * 4;
  const endExclusive = startAddress + byteLength;
  if (!Number.isSafeInteger(byteLength) || endExclusive > 0x100000000) {
    throw new RangeError(
      `zero-fill range exceeds unsigned 32-bit address space: ${toHex(startAddress)} + ${dwordCount} DWORDs`,
    );
  }
  return { startAddress, dwordCount, byteLength, endExclusive };
}

export function locateDwordInZeroFill({
  address,
  startAddress = ZERO_FILL.startAddress,
  dwordCount = ZERO_FILL.dwordCount,
}) {
  validateUnsigned32(address, "address");
  if (address % 4 !== 0) {
    throw new RangeError(
      `address must be DWORD-aligned; got ${toHex(address)}`,
    );
  }
  const range = describeDwordZeroFill({ startAddress, dwordCount });
  const covered =
    address >= range.startAddress && address < range.endExclusive;
  if (!covered) {
    return {
      address,
      covered: false,
      offset: null,
      dwordIndex: null,
      ...range,
    };
  }
  const offset = address - range.startAddress;
  return {
    address,
    covered: true,
    offset,
    dwordIndex: offset / 4,
    ...range,
  };
}

export function replaySparseDwordZeroFill({
  trackedDwords,
  startAddress = ZERO_FILL.startAddress,
  dwordCount = ZERO_FILL.dwordCount,
}) {
  if (!Array.isArray(trackedDwords)) {
    throw new TypeError("trackedDwords must be an array");
  }
  const seen = new Set();
  const range = describeDwordZeroFill({ startAddress, dwordCount });
  const dwords = trackedDwords.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new TypeError(`trackedDwords[${index}] must be an object`);
    }
    validateUnsigned32(entry.address, `trackedDwords[${index}].address`);
    validateUnsigned32(entry.value, `trackedDwords[${index}].value`);
    if (entry.address % 4 !== 0) {
      throw new RangeError(
        `trackedDwords[${index}].address must be DWORD-aligned; got ${toHex(entry.address)}`,
      );
    }
    if (seen.has(entry.address)) {
      throw new RangeError(
        `trackedDwords contains duplicate address ${toHex(entry.address)}`,
      );
    }
    seen.add(entry.address);
    const location = locateDwordInZeroFill({
      address: entry.address,
      startAddress,
      dwordCount,
    });
    return {
      address: entry.address,
      before: entry.value,
      after: location.covered ? 0 : entry.value,
      covered: location.covered,
      offset: location.offset,
      dwordIndex: location.dwordIndex,
    };
  });
  return { range, dwords };
}

export function replayStandardMissionEntry({
  stageWord,
  trackedDwords,
  mapDestinationBefore = "",
}) {
  validateUnsigned16(stageWord, "stageWord");
  if (typeof mapDestinationBefore !== "string") {
    throw new TypeError("mapDestinationBefore must be a string");
  }
  const zeroFill = replaySparseDwordZeroFill({ trackedDwords });
  const events = [
    { kind: "call", site: "0x004600cb", target: "0x00445770" },
    { kind: "call", site: "0x004600d0", target: "0x0048dbe0" },
    {
      kind: "call",
      site: "0x0048dbe9",
      target: "0x00460ba0",
      ecx: ZERO_FILL.startAddress,
    },
    {
      kind: "dword-zero-fill",
      site: "0x00460baf",
      startAddress: zeroFill.range.startAddress,
      dwordCount: zeroFill.range.dwordCount,
      endExclusive: zeroFill.range.endExclusive,
    },
    {
      kind: "read-word",
      site: "0x0048dc4c",
      address: "0x0088afcc",
      value: stageWord,
    },
    {
      kind: "call",
      site: "0x0048dc6d",
      target: "0x0048d410",
      stageWord,
      ecx: 0x00abf068,
    },
  ];

  let mapDestinationAfter = null;
  let mapDestinationAfterKnown = false;
  let mapDestinationOutcomeScope =
    "non-stage-1 destination outcome is outside this focused model; only absence of the K01 copier call is proven";
  if (stageWord === 1) {
    events.push(
      { kind: "call", site: "0x0048d42b", target: "0x0048d740" },
      {
        kind: "copy-nul-terminated-string",
        sourceAddress: 0x004c31c8,
        destinationAddress: 0x00abf068,
        value: "stagemap\\k01.map",
      },
    );
    mapDestinationAfter = "stagemap\\k01.map";
    mapDestinationAfterKnown = true;
    mapDestinationOutcomeScope =
      "stage 1 exact K01 source copy is statically proven";
  } else {
    events.push({
      kind: "stage-map-destination-unmodeled",
      stageWord,
      reason: mapDestinationOutcomeScope,
    });
  }

  events.push(
    { kind: "return", target: "0x0048dbe0" },
    { kind: "call", site: "0x004600d5", target: "0x004457d0" },
    {
      kind: "write-word-from-register",
      site: "0x004600da",
      address: "0x004bdfc8",
      register: "DI",
    },
  );
  return {
    stageWord,
    zeroFill,
    k01MapCopyRan: stageWord === 1,
    mapDestinationBefore,
    mapDestinationAfter,
    mapDestinationAfterKnown,
    mapDestinationOutcomeScope,
    events,
  };
}

export function extractK01MissionTimerReset(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer: executableBuffer, image } = readPeImage(paths.input);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXE_SHA256,
    "original executable SHA-256",
  );

  const documents = {
    manifest: readAnalysisJson(paths.manifest, "manifest"),
    seeds: readAnalysisJson(paths.seeds, "seed CFG"),
    functions: readAnalysisJson(paths.functions, "function"),
    references: readAnalysisJson(paths.references, "reference"),
    strings: readAnalysisJson(paths.strings, "string"),
    jumpTables: readAnalysisJson(paths.jumpTables, "jump-table"),
  };
  for (const [label, document] of Object.entries(documents)) {
    assertEqual(
      document.sourceSha256,
      executableSha256,
      `${label} canonical analysis source SHA-256`,
    );
  }
  assertEqual(documents.manifest.seedCount, 202, "manifest seed count");
  assertEqual(
    documents.manifest.seedFunctionCount,
    194,
    "manifest seeded function count",
  );

  const configuredSeeds = REQUIRED_SEEDS.map(([address, label, functionEntry]) =>
    validateSeed(documents.seeds, address, label, functionEntry),
  );
  const analyzedFunctions = [...EXPECTED_FUNCTIONS].map(([entry, expected]) =>
    validateFunction(documents.seeds, documents.functions, entry, expected),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(documents.seeds, documents.functions, site, caller, callee),
  );
  const requiredInstructions = REQUIRED_INSTRUCTIONS.map(
    ([site, functionEntry, text]) => {
      const instruction = requireInstruction(
        documents.seeds,
        functionEntry,
        site,
        text,
      );
      return {
        address: toHex(site),
        functionEntry: toHex(functionEntry),
        text,
        bytes: instruction.bytes,
      };
    },
  );
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(executableBuffer, image, anchor),
  );
  const jumpTables = validateJumpTables(documents.jumpTables);
  const k01MapSource = validateK01MapSource(
    documents.strings,
    documents.references,
    executableBuffer,
    image,
  );
  const timerReferences = validateTimerReferences(documents.references);
  const zeroFill = validateCanonicalZeroFill();

  return {
    question: QUESTION,
    analysisStatus: "static-proven",
    reproductionStatus: "reproduction-complete",
    implementationStatus: "none",
    integrationStatus:
      "gated-no-exact-original-clock-result-identity-or-project-policy-mapping",
    source: { path: paths.input, sha256: executableSha256 },
    canonicalAnalysis: {
      seedCount: documents.manifest.seedCount,
      seedFunctionCount: documents.manifest.seedFunctionCount,
      configuredSeeds,
    },
    analyzedFunctions,
    callEdges,
    requiredInstructions,
    codeAnchors,
    jumpTables,
    zeroFill,
    k01MapSource,
    timerReferences,
    eventOrder: [
      "main state 1 label 0 calls 0x00445770",
      "main calls 0x0048dbe0",
      "0x0048dbe0 sets ECX 0x007c5ed8 and calls 0x00460ba0",
      "0x00460ba0 REP STOSD zeros [0x007c5ed8, 0x00843980)",
      "0x0048dbe0 later reads and pushes stage WORD 0x0088afcc",
      "0x0048dbe0 calls 0x0048d410 on ECX 0x00abf068",
      "stage 1 calls 0x0048d740 and copies stagemap\\k01.map",
      "main then calls 0x004457d0 and writes current state from DI",
    ],
    testVectors: [
      "start, last-covered DWORD, and exclusive-end boundary",
      "active count, win/loss timer, nearby DWORDs, and K01 trigger flag containing DWORD",
      "timer 0xffffffff prevalues become zero",
      "stage 1 K01 copy after reset and non-K01 stage reset without K01 copy",
      "unsigned width, DWORD alignment, count overflow, duplicate sparse address failures",
      "stale source, missing function, modified instruction/call/jump-table/reference/string/EXE",
    ],
    uncertainties: [
      "the human meanings of surrounding 0x00445770 and 0x004457d0 calls remain opaque",
      "direct timer references are distinct from the proven indirect range write; no whole-binary uniqueness claim is made",
      "the incidental zero at 0x008438dc does not prove its full reset lifecycle or any minimap behavior",
      "raw clock, result identity, and policy are not mapped to project 24 Hz or generic runtime state",
    ],
  };
}

function validateCanonicalZeroFill() {
  const range = describeDwordZeroFill();
  assertEqual(range.byteLength, ZERO_FILL.byteLength, "zero-fill byte length");
  assertEqual(
    range.endExclusive,
    ZERO_FILL.endExclusive,
    "zero-fill exclusive end",
  );
  const trackedAddresses = TRACKED_ADDRESSES.map((expected) => {
    const actual = locateDwordInZeroFill({ address: expected.address });
    assertEqual(actual.covered, true, `${expected.id} coverage`);
    assertEqual(actual.offset, expected.offset, `${expected.id} offset`);
    assertEqual(
      actual.dwordIndex,
      expected.dwordIndex,
      `${expected.id} DWORD index`,
    );
    return {
      id: expected.id,
      address: toHex(expected.address),
      offset: toHex(actual.offset),
      dwordIndex: toHex(actual.dwordIndex),
    };
  });
  assertEqual(
    locateDwordInZeroFill({ address: 0x0084397c }).covered,
    true,
    "last DWORD coverage",
  );
  assertEqual(
    locateDwordInZeroFill({ address: 0x00843980 }).covered,
    false,
    "exclusive end coverage",
  );
  return {
    startAddress: toHex(range.startAddress),
    dwordCount: toHex(range.dwordCount),
    byteLength: toHex(range.byteLength),
    endExclusive: toHex(range.endExclusive),
    lastCoveredDword: "0x0084397c",
    trackedAddresses,
  };
}

function validateJumpTables(document) {
  const main = requireJumpTable(document, 0x0045f9c0, 0x0045fd56);
  const stage = requireJumpTable(document, 0x0048d410, 0x0048d422);
  const mainCase = main.cases.find(({ label }) => label === 0);
  assertDeepEqual(
    mainCase,
    { destination: "0x004600cb", label: 0 },
    "raw state 1 normalized label 0",
  );
  const stageCase = stage.cases.find(({ label }) => label === 1);
  assertDeepEqual(
    stageCase,
    { destination: "0x0048d429", label: 1 },
    "stage 1 map initializer case",
  );
  assertEqual(stage.cases.length, 28, "stage jump-table case count");
  assertDeepEqual(
    stage.cases.map(({ label }) => label).sort((left, right) => left - right),
    Array.from({ length: 28 }, (_, index) => index + 1),
    "stage jump-table labels",
  );
  const k01DestinationCases = stage.cases.filter(
    ({ destination }) => destination === "0x0048d429",
  );
  assertDeepEqual(
    k01DestinationCases,
    [{ destination: "0x0048d429", label: 1 }],
    "K01 stage-map destination exclusivity",
  );
  return {
    main: {
      switchAddress: main.switchAddress,
      caseCount: main.cases.length,
      rawState: 1,
      normalizedLabel: 0,
      destination: mainCase.destination,
    },
    stage: {
      switchAddress: stage.switchAddress,
      caseCount: stage.cases.length,
      stageWord: 1,
      destination: stageCase.destination,
      k01DestinationLabels: k01DestinationCases.map(({ label }) => label),
    },
  };
}

function validateK01MapSource(strings, references, buffer, image) {
  const entry = strings.strings?.find(
    ({ address }) => address === "0x004c31c8",
  );
  if (!entry) throw new Error("Missing K01 stage-map source string");
  assertEqual(entry.value, "stagemap\\k01.map", "K01 stage-map source");
  assertDeepEqual(
    entry.references,
    ["0x0048d744|DATA", "0x0048d74e|READ"],
    "K01 stage-map string references",
  );
  const rawOffset = image.vaToRawOffset(0x004c31c8);
  if (rawOffset === undefined) {
    throw new Error("K01 stage-map source is not file-backed");
  }
  const expectedBytes = Buffer.from("stagemap\\k01.map\0", "latin1");
  const actualBytes = buffer.subarray(
    rawOffset,
    rawOffset + expectedBytes.length,
  );
  if (!actualBytes.equals(expectedBytes)) {
    throw new Error(
      `K01 stage-map source bytes mismatch: expected ${formatBytes(expectedBytes)}, got ${formatBytes(actualBytes)}`,
    );
  }
  const expectedReferences = [
    ["0x0048d744", "DATA"],
    ["0x0048d74e", "READ"],
  ];
  const validatedReferences = expectedReferences.map(([from, type]) => {
    const reference = references.references?.find(
      (candidate) =>
        candidate.from === from &&
        candidate.to === "0x004c31c8" &&
        candidate.type === type &&
        candidate.fromFunctionEntry === "0x0048d740",
    );
    if (!reference) {
      throw new Error(`Missing K01 map source ${type} reference at ${from}`);
    }
    return {
      from,
      type,
      to: reference.to,
      fromFunctionEntry: reference.fromFunctionEntry,
    };
  });
  return {
    address: entry.address,
    value: entry.value,
    rawOffset: toHex(rawOffset),
    copiedByteLengthIncludingNul: expectedBytes.length,
    ghidraDataLength: entry.length,
    references: validatedReferences,
  };
}

function validateTimerReferences(document) {
  return TIMER_REFERENCE_EXPECTATIONS.map((expected) => {
    const references = document.references?.filter(
      ({ to }) => to === expected.address,
    );
    assertEqual(
      references.length,
      expected.total,
      `${expected.id} direct reference count`,
    );
    const writes = references.filter(({ type }) => type === "WRITE");
    assertEqual(
      writes.length,
      expected.writes,
      `${expected.id} direct WRITE reference count`,
    );
    const scopedDirectReferences = references.filter(({ fromFunctionEntry }) =>
      ZERO_FILL_FUNCTIONS.has(fromFunctionEntry),
    );
    assertEqual(
      scopedDirectReferences.length,
      0,
      `${expected.id} direct references in indirect zero-fill/map chain`,
    );
    return {
      id: expected.id,
      address: expected.address,
      directReferenceCount: references.length,
      directWriteCount: writes.length,
      indirectRangeWrite:
        "0x00460baf REP STOSD covers this address without a direct timer-address reference",
    };
  });
}

function validateSeed(document, address, label, functionEntry) {
  const seed = document.seeds?.find(
    (candidate) => candidate.address === toHex(address),
  );
  if (!seed) throw new Error(`Missing configured seed ${toHex(address)}`);
  assertEqual(seed.label, label, `${toHex(address)} seed label`);
  assertEqual(
    seed.functionEntry,
    toHex(functionEntry),
    `${toHex(address)} containing function`,
  );
  return {
    address: toHex(address),
    label,
    functionEntry: toHex(functionEntry),
  };
}

function validateFunction(seeds, functions, entry, expected) {
  const seed = requireFunction(seeds, entry);
  const summary = functions.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!summary) throw new Error(`Missing function summary ${toHex(entry)}`);
  const [range, instructionCount, blockCount, instructionSha256] = expected;
  assertDeepEqual(seed.bodyRanges, [range], `${toHex(entry)} body range`);
  assertEqual(
    seed.instructions.length,
    instructionCount,
    `${toHex(entry)} instruction count`,
  );
  assertEqual(
    seed.basicBlocks.length,
    blockCount,
    `${toHex(entry)} basic-block count`,
  );
  assertEqual(
    summary.instructionSha256,
    instructionSha256,
    `${toHex(entry)} instruction SHA-256`,
  );
  return {
    entry: toHex(entry),
    name: summary.name,
    bodyRanges: seed.bodyRanges,
    instructionCount,
    basicBlockCount: blockCount,
    instructionSha256,
  };
}

function requireCallEdge(seeds, functions, site, caller, callee) {
  const instruction = requireInstruction(
    seeds,
    caller,
    site,
    `CALL ${toHex(callee)}`,
  );
  const summary = functions.functions?.find(
    (candidate) => candidate.entry === toHex(caller),
  );
  if (!summary?.callees?.includes(toHex(callee))) {
    throw new Error(
      `Function summary omits ${toHex(caller)} -> ${toHex(callee)}`,
    );
  }
  return {
    callSite: toHex(site),
    caller: toHex(caller),
    callee: toHex(callee),
    bytes: instruction.bytes,
  };
}

function requireInstruction(seeds, functionEntry, address, text) {
  const report = requireFunction(seeds, functionEntry);
  const instruction = report.instructions.find(
    (candidate) =>
      Number(candidate.address) === address && candidate.text === text,
  );
  if (!instruction) {
    throw new Error(
      `Missing instruction ${toHex(address)} in ${toHex(functionEntry)}: ${text}`,
    );
  }
  return instruction;
}

function requireFunction(seeds, entry) {
  const report = seeds.functions?.find(
    (candidate) => candidate.entry === toHex(entry),
  );
  if (!report?.instructions || !report?.basicBlocks) {
    throw new Error(`Ghidra seeds omit function ${toHex(entry)}`);
  }
  return report;
}

function requireJumpTable(document, functionEntry, switchAddress) {
  const table = document.tables?.find(
    (candidate) =>
      candidate.functionEntry === toHex(functionEntry) &&
      candidate.switchAddress === toHex(switchAddress),
  );
  if (!table) {
    throw new Error(
      `Missing jump table ${toHex(switchAddress)} in ${toHex(functionEntry)}`,
    );
  }
  return table;
}

function validateCodeAnchor(buffer, image, anchor) {
  const rawOffset = image.vaToRawOffset(anchor.va);
  if (rawOffset === undefined) {
    throw new Error(`${toHex(anchor.va)} is not file-backed`);
  }
  const expected = Buffer.from(anchor.bytes.replaceAll(" ", ""), "hex");
  const actual = buffer.subarray(rawOffset, rawOffset + expected.length);
  if (!actual.equals(expected)) {
    throw new Error(
      `Static code anchor ${anchor.id} mismatch at ${toHex(anchor.va)}: expected ${formatBytes(expected)}, got ${formatBytes(actual)}`,
    );
  }
  return {
    id: anchor.id,
    va: toHex(anchor.va),
    rawOffset: toHex(rawOffset),
    byteLength: expected.length,
    bytes: formatBytes(expected),
    matched: true,
  };
}

function validateUnsigned16(value, label) {
  validateIntegerRange(value, 0, 0xffff, label);
}

function validateUnsigned32(value, label) {
  validateIntegerRange(value, 0, 0xffffffff, label);
}

function validateIntegerRange(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}, got ${value}`,
    );
  }
}

function readAnalysisJson(path, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed.sourceSha256 !== "string") {
      throw new Error("missing sourceSha256");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Cannot read ${label} analysis from ${path}: ${error.message}`,
      { cause: error },
    );
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(buffer) {
  return [...buffer]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${JSON.stringify(extractK01MissionTimerReset(), null, 2)}\n`,
  );
}
