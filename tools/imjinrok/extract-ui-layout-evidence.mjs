#!/usr/bin/env node
import { readPeImage, readCString, toHex } from "./pe-image.mjs";
import { extractExecutableReferences } from "./extract-executable-refs.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const ASCII_MIN_LENGTH = 4;

export const UI_LAYOUT_STATIC_PROBES = [
  {
    id: "select-stage-border-bind",
    category: "stage-select",
    startVa: 0x004aafa0,
    endVa: 0x004ab07c,
    anchors: ["YSELECTSTAGE", "YSELECTSTAGE [%s]", "yfnt\\selectstageborder.spr"],
    meaning: "stage-selection border/control binding path",
  },
  {
    id: "map-control-range-check",
    category: "stage-select-map",
    startVa: 0x004994b8,
    endVa: 0x004994de,
    anchors: ["YMAP000 [%d]"],
    meaning: "map-control range check and diagnostic path",
  },
  {
    id: "map-control-hit-test",
    category: "stage-select-map",
    startVa: 0x0049b190,
    endVa: 0x0049b1ef,
    anchors: ["YMAP006 [%d][%d]"],
    meaning: "map-control hit-test loop candidate",
  },
  {
    id: "ok-cancel-control-bind",
    category: "modal-controls",
    startVa: 0x00494b80,
    endVa: 0x00494c20,
    anchors: ["YOKCANCEL", "YOKCANCEL [%s]", "yfnt\\infoborder.spr"],
    meaning: "OK/cancel modal border/control binding path",
  },
  {
    id: "mouse-interface-primary",
    category: "hud-mouse-interface",
    startVa: 0x004a51b7,
    endVa: 0x004a5218,
    anchors: ["yfnt\\mouseinterface.spr"],
    meaning: "primary mouse-interface resource setup path",
  },
  {
    id: "mouse-interface-secondary",
    category: "hud-mouse-interface",
    startVa: 0x004aaab0,
    endVa: 0x004aab1a,
    anchors: ["yfnt\\mouseinterface.spr"],
    meaning: "secondary mouse-interface resource setup path",
  },
  {
    id: "objective-border-bind",
    category: "hud-resource-candidates",
    startVa: 0x004a5730,
    endVa: 0x004a57d4,
    anchors: ["yfnt\\objectiveborder.spr"],
    meaning: "objective panel border resource/control binding path",
  },
  {
    id: "hero-panel-bind",
    category: "hud-resource-candidates",
    startVa: 0x004a7410,
    endVa: 0x004a747c,
    anchors: ["yfnt\\hero.spr"],
    meaning: "hero panel resource/control binding path",
  },
  {
    id: "hero-panel-update-draw",
    category: "hud-hero-panel-draw-candidates",
    startVa: 0x004a7690,
    endVa: 0x004a7868,
    anchors: [],
    includeCandidateConstants: false,
    meaning: "hero panel update path that resolves hero identity and draws a resource-backed frame candidate",
  },
  {
    id: "selected-panel-progress-draw",
    category: "hud-selected-progress-candidates",
    startVa: 0x004a7880,
    endVa: 0x004a79c2,
    anchors: [],
    includeCandidateConstants: false,
    includeIndirectCalls: true,
    meaning: "selected unit/building panel progress overlay path with percent-style 0x64 clamp and 0x51eb851f division constants",
  },
  {
    id: "selected-panel-production-text-draw",
    category: "hud-selected-production-text-candidates",
    startVa: 0x004a81f0,
    endVa: 0x004a83f1,
    anchors: [],
    includeCandidateConstants: false,
    includeIndirectCalls: true,
    meaning: "selected panel production/building text overlay path reached from the non-progress slot branch",
  },
  {
    id: "selected-panel-slot-dispatch",
    category: "hud-selected-production-text-candidates",
    startVa: 0x004a84e0,
    endVa: 0x004a8580,
    anchors: [],
    includeCandidateConstants: false,
    includeIndirectCalls: true,
    meaning: "selected panel slot dispatch that chooses between 0x004a7880 progress and 0x004a81f0 production/text branches",
  },
  {
    id: "bottom-panel-text-numeric-draw",
    category: "hud-bottom-panel-text-candidates",
    startVa: 0x004567c0,
    endVa: 0x00457445,
    anchors: ["%s", "%s(%c)", " %d "],
    includeCandidateConstants: false,
    includeIndirectCalls: true,
    meaning:
      "bottom selection panel text/numeric draw path that formats a label from [esi+0x94], up to four numeric fields at [esi+0x294..0x29a], and up to three extra text lines at [esi+0x114..]",
  },
  {
    id: "bottom-panel-main-hud-call-order",
    category: "hud-bottom-panel-text-candidates",
    startVa: 0x00447b00,
    endVa: 0x00447b34,
    anchors: [],
    includeCandidateConstants: false,
    meaning:
      "main HUD update call order that checks selected-panel state, calls 0x004a84e0, then calls the 0x004567c0 bottom text/numeric object at 0x00bcdd58",
  },
  {
    id: "hero-panel-name-table-lookup",
    category: "hud-hero-panel-draw-candidates",
    startVa: 0x004a8870,
    endVa: 0x004a88e8,
    anchors: [],
    includeCandidateConstants: false,
    meaning: "hero name-to-table-index lookup path that consumes the hero.spr setup table at 0x00c83e00",
  },
  {
    id: "progress-bar-bind",
    category: "hud-resource-candidates",
    startVa: 0x004a94b8,
    endVa: 0x004a958a,
    anchors: ["yfnt\\ProgressBar_Small.spr", "yfnt\\ProgressBar_Large.spr", "YYPROGRESSBARCONTROL0000001"],
    meaning: "progress bar resource/control binding path",
  },
  {
    id: "game-speed-bind",
    category: "hud-resource-candidates",
    startVa: 0x004ac360,
    endVa: 0x004ac417,
    anchors: ["yfnt\\gamespeed.spr", "YSPEEDCONTROL000"],
    meaning: "game speed control resource/control binding path",
  },
  {
    id: "objective-border-update-draw",
    category: "hud-nonhero-draw-candidates",
    startVa: 0x004a5980,
    endVa: 0x004a5aac,
    anchors: [],
    includeCandidateConstants: false,
    meaning: "objective panel update/draw path that consumes the objectiveborder.spr setup handle",
  },
  {
    id: "progress-bar-update-draw",
    category: "hud-nonhero-draw-candidates",
    startVa: 0x004a95d0,
    endVa: 0x004a9724,
    anchors: [],
    includeCandidateConstants: false,
    meaning: "progress bar lifetime and update/draw path that consumes the ProgressBar setup tables",
  },
  {
    id: "game-speed-update-draw",
    category: "hud-nonhero-draw-candidates",
    startVa: 0x004ac440,
    endVa: 0x004ac5b4,
    anchors: [],
    includeCandidateConstants: false,
    meaning: "game speed state/update path that consumes the gamespeed.spr setup table",
  },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractUiLayoutStaticEvidence(args.input ?? DEFAULT_EXECUTABLE_PATH);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractUiLayoutStaticEvidence(executablePath = DEFAULT_EXECUTABLE_PATH) {
  const { buffer, image } = readPeImage(executablePath);
  const executableReferences = extractExecutableReferences(executablePath);
  const strings = extractAsciiStrings(buffer, image);
  const stringsByVa = new Map(strings.map((entry) => [entry.va, entry]));
  const stringsByValue = new Map(strings.map((entry) => [entry.value, entry]));
  const referencesByValue = new Map(executableReferences.references.map((entry) => [entry.value, entry]));

  return {
    executablePath,
    imageBase: toHex(image.imageBase),
    probes: UI_LAYOUT_STATIC_PROBES.map((probe) =>
      extractProbeEvidence(buffer, image, stringsByVa, stringsByValue, referencesByValue, probe),
    ),
  };
}

function extractProbeEvidence(buffer, image, stringsByVa, stringsByValue, referencesByValue, probe) {
  const startRawOffset = image.vaToRawOffset(probe.startVa);
  const endRawOffset = image.vaToRawOffset(probe.endVa);
  if (startRawOffset === undefined || endRawOffset === undefined) {
    throw new Error(`Probe ${probe.id} range is outside the executable image`);
  }

  const events = scanCodeWindow(buffer, image, stringsByVa, startRawOffset, endRawOffset);
  const anchorRefs = probe.anchors.map((anchor) => {
    const reference = referencesByValue.get(anchor);
    const string = stringsByValue.get(anchor);
    return {
      value: anchor,
      va: reference?.va ?? string?.va,
      rawOffset: reference?.rawOffset ?? string?.rawOffset,
      present: Boolean(reference) || events.some((event) => event.string === anchor),
    };
  });

  return {
    id: probe.id,
    category: probe.category,
    meaning: probe.meaning,
    includeCandidateConstants: probe.includeCandidateConstants,
    startVa: toHex(probe.startVa),
    endVa: toHex(probe.endVa),
    startRawOffset: toHex(startRawOffset),
    endRawOffset: toHex(endRawOffset),
    anchors: anchorRefs,
    pushStrings: events.filter((event) => event.kind === "push-imm32" && event.string),
    pushImmediates: events.filter((event) => event.kind === "push-imm32"),
    pushSmallImmediates: events.filter((event) => event.kind === "push-imm8"),
    callTargets: events.filter((event) => isCallEvent(event, probe.includeIndirectCalls === true)),
    callsiteContexts: buildCallsiteContexts(events, probe.includeIndirectCalls === true),
    stackWrites: events.filter((event) => event.kind === "mov-stack-dword-imm32"),
    stackWordWrites: events.filter((event) => event.kind === "mov-stack-word-imm16"),
    fieldRefs: events.filter((event) => event.kind === "esi-field-ref" || event.kind === "ebx-field-ref"),
    globalRefs: events.filter((event) => event.kind === "absolute-memory-ref"),
    indexedGlobalRefs: events.filter((event) => event.kind === "indexed-global-ref"),
    registerDisplacementRefs: events.filter((event) => event.kind === "register-displacement-ref"),
    comparisons: events.filter((event) => event.kind === "cmp-reg-imm8" || event.kind === "cmp-reg16-imm8"),
  };
}

function buildCallsiteContexts(events, includeIndirectCalls = false) {
  const contexts = [];
  let segmentStartIndex = 0;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!isCallEvent(event, includeIndirectCalls)) {
      continue;
    }

    const segmentEvents = events.slice(segmentStartIndex, index);
    contexts.push({
      callVa: event.va,
      target: event.target,
      segmentStartVa: segmentEvents[0]?.va ?? event.va,
      preCallPushes: segmentEvents.filter((candidate) => candidate.kind === "push-imm32" || candidate.kind === "push-imm8"),
      preCallStackWrites: segmentEvents.filter((candidate) => candidate.kind === "mov-stack-dword-imm32"),
      preCallStackWordWrites: segmentEvents.filter((candidate) => candidate.kind === "mov-stack-word-imm16"),
      preCallFieldRefs: segmentEvents.filter((candidate) => candidate.kind === "esi-field-ref" || candidate.kind === "ebx-field-ref"),
      preCallGlobalRefs: segmentEvents.filter((candidate) => candidate.kind === "absolute-memory-ref"),
      preCallIndexedGlobalRefs: segmentEvents.filter((candidate) => candidate.kind === "indexed-global-ref"),
      preCallRegisterDisplacementRefs: segmentEvents.filter((candidate) => candidate.kind === "register-displacement-ref"),
      preCallComparisons: segmentEvents.filter((candidate) => candidate.kind === "cmp-reg-imm8" || candidate.kind === "cmp-reg16-imm8"),
    });
    segmentStartIndex = index + 1;
  }

  return contexts;
}

function isCallEvent(event, includeIndirectCalls = false) {
  return (
    event.kind === "call-rel32" ||
    (includeIndirectCalls && (event.kind === "call-absolute-indirect" || event.kind === "call-register-indirect"))
  );
}

function scanCodeWindow(buffer, image, stringsByVa, startRawOffset, endRawOffset) {
  const events = [];

  for (let rawOffset = startRawOffset; rawOffset < endRawOffset; ) {
    const va = image.rawOffsetToVa(rawOffset);
    const byte = buffer[rawOffset];
    let instructionLength = 1;

    if (byte === 0x68 && rawOffset + 5 <= endRawOffset) {
      const immediate = buffer.readUInt32LE(rawOffset + 1);
      const immediateHex = toHex(immediate);
      events.push({
        kind: "push-imm32",
        va: toHex(va),
        immediate: immediateHex,
        string: resolveString(buffer, image, immediate, immediateHex, stringsByVa),
      });
      instructionLength = 5;
    }

    if (byte === 0x6a && rawOffset + 2 <= endRawOffset) {
      events.push({
        kind: "push-imm8",
        va: toHex(va),
        immediate: toHex(buffer.readUInt8(rawOffset + 1)),
      });
      instructionLength = Math.max(instructionLength, 2);
    }

    if (byte === 0xe8 && rawOffset + 5 <= endRawOffset) {
      const targetVa = va + 5 + buffer.readInt32LE(rawOffset + 1);
      if (image.vaToRawOffset(targetVa) !== undefined) {
        events.push({
          kind: "call-rel32",
          va: toHex(va),
          target: toHex(targetVa),
        });
      }
      instructionLength = Math.max(instructionLength, 5);
    }

    const indirectCall = readIndirectCall(buffer, rawOffset, endRawOffset);
    if (indirectCall) {
      const { instructionLength: decodedLength, ...event } = indirectCall;
      events.push({ ...event, va: toHex(va) });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    if (
      byte === 0x66 &&
      buffer[rawOffset + 1] === 0xc7 &&
      buffer[rawOffset + 2] === 0x44 &&
      buffer[rawOffset + 3] === 0x24 &&
      rawOffset + 7 <= endRawOffset
    ) {
      events.push({
        kind: "mov-stack-word-imm16",
        va: toHex(va),
        stackOffset: toHex(buffer[rawOffset + 4]),
        immediate: toHex(buffer.readUInt16LE(rawOffset + 5)),
      });
      instructionLength = Math.max(instructionLength, 7);
    }

    if (
      byte === 0xc7 &&
      buffer[rawOffset + 1] === 0x44 &&
      buffer[rawOffset + 2] === 0x24 &&
      rawOffset + 8 <= endRawOffset
    ) {
      events.push({
        kind: "mov-stack-dword-imm32",
        va: toHex(va),
        stackOffset: toHex(buffer[rawOffset + 3]),
        immediate: toHex(buffer.readUInt32LE(rawOffset + 4)),
      });
      instructionLength = Math.max(instructionLength, 8);
    }

    const esiField = readRegisterFieldRef(buffer, rawOffset, endRawOffset, 0x86, "esi");
    if (esiField) {
      const { instructionLength: decodedLength, ...event } = esiField;
      events.push({ ...event, va: toHex(va), kind: "esi-field-ref" });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    const ebxField = readRegisterFieldRef(buffer, rawOffset, endRawOffset, 0x83, "ebx");
    if (ebxField) {
      const { instructionLength: decodedLength, ...event } = ebxField;
      events.push({ ...event, va: toHex(va), kind: "ebx-field-ref" });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    const comparison = readImmediateComparison(buffer, rawOffset, endRawOffset);
    if (comparison) {
      const { instructionLength: decodedLength, ...event } = comparison;
      events.push({ ...event, va: toHex(va) });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    const absoluteMemoryRef = readAbsoluteMemoryRef(buffer, rawOffset, endRawOffset);
    if (absoluteMemoryRef) {
      const { instructionLength: decodedLength, ...event } = absoluteMemoryRef;
      events.push({ ...event, va: toHex(va), kind: "absolute-memory-ref" });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    const indexedGlobalRef = readIndexedGlobalRef(buffer, rawOffset, endRawOffset);
    if (indexedGlobalRef) {
      const { instructionLength: decodedLength, ...event } = indexedGlobalRef;
      events.push({ ...event, va: toHex(va), kind: "indexed-global-ref" });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    const registerDisplacementRef = readRegisterDisplacementRef(buffer, rawOffset, endRawOffset);
    if (registerDisplacementRef) {
      const { instructionLength: decodedLength, ...event } = registerDisplacementRef;
      events.push({ ...event, va: toHex(va), kind: "register-displacement-ref" });
      instructionLength = Math.max(instructionLength, decodedLength);
    }

    rawOffset += instructionLength;
  }

  return events;
}

function readIndirectCall(buffer, rawOffset, endRawOffset) {
  if (rawOffset + 2 > endRawOffset || buffer[rawOffset] !== 0xff) {
    return undefined;
  }

  const modrm = buffer[rawOffset + 1];
  const operation = (modrm >> 3) & 0x7;
  if (operation !== 2) {
    return undefined;
  }

  if (modrm === 0x15 && rawOffset + 6 <= endRawOffset) {
    const address = buffer.readUInt32LE(rawOffset + 2);
    if (address < 0x00400000) {
      return undefined;
    }

    return {
      kind: "call-absolute-indirect",
      target: `[${toHex(address)}]`,
      address: toHex(address),
      instructionLength: 6,
    };
  }

  const mod = (modrm >> 6) & 0x3;
  const base = modrm & 0x7;
  if (mod === 1 && base !== 4 && rawOffset + 3 <= endRawOffset) {
    return {
      kind: "call-register-indirect",
      target: `[${registerName(base)}+${toHex(buffer.readUInt8(rawOffset + 2))}]`,
      baseRegister: registerName(base),
      displacement: toHex(buffer.readUInt8(rawOffset + 2)),
      instructionLength: 3,
    };
  }

  return undefined;
}

function readRegisterFieldRef(buffer, rawOffset, endRawOffset, modrmFieldByte, registerName) {
  if (rawOffset + 6 > endRawOffset) {
    return undefined;
  }

  const opcode = buffer[rawOffset];
  const modrm = buffer[rawOffset + 1];
  if ((opcode === 0x8b || opcode === 0x8d) && isDisp32BaseModrm(modrm, modrmFieldByte)) {
    return {
      operation: opcode === 0x8b ? "mov-r32-from-field" : "lea-r32-from-field",
      baseRegister: registerName,
      fieldOffset: toHex(buffer.readUInt32LE(rawOffset + 2)),
      instructionLength: 6,
    };
  }

  if (rawOffset + 7 > endRawOffset || buffer[rawOffset] !== 0x66) {
    return undefined;
  }

  if (
    (buffer[rawOffset + 1] === 0x8b || buffer[rawOffset + 1] === 0x89) &&
    isDisp32BaseModrm(buffer[rawOffset + 2], modrmFieldByte)
  ) {
    return {
      operation: buffer[rawOffset + 1] === 0x8b ? "mov-r16-from-field" : "mov-field-from-r16",
      baseRegister: registerName,
      fieldOffset: toHex(buffer.readUInt32LE(rawOffset + 3)),
      instructionLength: 7,
    };
  }

  return undefined;
}

function isDisp32BaseModrm(modrm, baseModrmMask) {
  return (modrm & 0xc7) === baseModrmMask;
}

function readImmediateComparison(buffer, rawOffset, endRawOffset) {
  if (rawOffset + 3 <= endRawOffset && buffer[rawOffset] === 0x83) {
    const registerName = compareRegisterName(buffer[rawOffset + 1]);
    if (registerName) {
      return {
        kind: "cmp-reg-imm8",
        register: registerName,
        immediate: toHex(buffer.readUInt8(rawOffset + 2)),
        instructionLength: 3,
      };
    }
  }

  if (rawOffset + 4 <= endRawOffset && buffer[rawOffset] === 0x66 && buffer[rawOffset + 1] === 0x83) {
    const registerName = compareRegisterName(buffer[rawOffset + 2]);
    if (registerName) {
      return {
        kind: "cmp-reg16-imm8",
        register: registerName,
        immediate: toHex(buffer.readUInt8(rawOffset + 3)),
        instructionLength: 4,
      };
    }
  }

  return undefined;
}

function readAbsoluteMemoryRef(buffer, rawOffset, endRawOffset) {
  const opcode = buffer[rawOffset];

  if ((opcode === 0xa1 || opcode === 0xa3) && rawOffset + 5 <= endRawOffset) {
    const address = buffer.readUInt32LE(rawOffset + 1);
    if (address < 0x00400000) {
      return undefined;
    }

    return {
      operation: opcode === 0xa1 ? "mov-eax-from-absolute" : "mov-absolute-from-eax",
      address: toHex(address),
      instructionLength: 5,
    };
  }

  if ((opcode === 0x8b || opcode === 0x89) && rawOffset + 6 <= endRawOffset) {
    const modrm = buffer[rawOffset + 1];
    if ((modrm & 0xc7) === 0x05) {
      const address = buffer.readUInt32LE(rawOffset + 2);
      if (address < 0x00400000) {
        return undefined;
      }

      return {
        operation: opcode === 0x8b ? "mov-r32-from-absolute" : "mov-absolute-from-r32",
        register: registerName((modrm >> 3) & 0x7),
        address: toHex(address),
        instructionLength: 6,
      };
    }
  }

  if (rawOffset + 8 <= endRawOffset && buffer[rawOffset] === 0x66 && buffer[rawOffset + 1] === 0x83) {
    const modrm = buffer[rawOffset + 2];
    if (modrm === 0x3d) {
      const address = buffer.readUInt32LE(rawOffset + 3);
      if (address < 0x00400000) {
        return undefined;
      }

      return {
        operation: "cmp-word-absolute-imm8",
        address: toHex(address),
        immediate: toHex(buffer.readUInt8(rawOffset + 7)),
        instructionLength: 8,
      };
    }
  }

  if (rawOffset + 7 <= endRawOffset && buffer[rawOffset] === 0x66 && buffer[rawOffset + 1] === 0xff) {
    const modrm = buffer[rawOffset + 2];
    if (modrm === 0x05 || modrm === 0x0d) {
      const address = buffer.readUInt32LE(rawOffset + 3);
      if (address < 0x00400000) {
        return undefined;
      }

      return {
        operation: modrm === 0x05 ? "inc-word-absolute" : "dec-word-absolute",
        address: toHex(address),
        instructionLength: 7,
      };
    }
  }

  return undefined;
}

function readIndexedGlobalRef(buffer, rawOffset, endRawOffset) {
  if (rawOffset + 7 > endRawOffset || buffer[rawOffset] !== 0x8b) {
    return undefined;
  }

  const modrm = buffer[rawOffset + 1];
  if ((modrm & 0xc7) !== 0x04) {
    return undefined;
  }

  const sib = buffer[rawOffset + 2];
  if ((sib & 0x7) !== 0x5) {
    return undefined;
  }

  return {
    operation: "mov-r32-from-indexed-global",
    register: registerName((modrm >> 3) & 0x7),
    indexRegister: registerName((sib >> 3) & 0x7),
    scale: 1 << ((sib >> 6) & 0x3),
    address: toHex(buffer.readUInt32LE(rawOffset + 3)),
    instructionLength: 7,
  };
}

function readRegisterDisplacementRef(buffer, rawOffset, endRawOffset) {
  if (rawOffset + 6 > endRawOffset || buffer[rawOffset] !== 0x8b) {
    return undefined;
  }

  const modrm = buffer[rawOffset + 1];
  if ((modrm & 0xc0) !== 0x80) {
    return undefined;
  }

  const baseRegisterIndex = modrm & 0x7;
  if (baseRegisterIndex === 4 || baseRegisterIndex === 5) {
    return undefined;
  }

  const displacement = buffer.readUInt32LE(rawOffset + 2);
  if (displacement < 0x00400000) {
    return undefined;
  }

  return {
    operation: "mov-r32-from-register-displacement",
    register: registerName((modrm >> 3) & 0x7),
    baseRegister: registerName(baseRegisterIndex),
    displacement: toHex(displacement),
    instructionLength: 6,
  };
}

function registerName(index) {
  return ["eax", "ecx", "edx", "ebx", "esp", "ebp", "esi", "edi"][index] ?? `r${index}`;
}

function compareRegisterName(modrm) {
  return (
    {
      0xf8: "eax",
      0xf9: "ecx",
      0xfa: "edx",
      0xfb: "ebx",
      0xfc: "esp",
      0xfd: "ebp",
      0xfe: "esi",
      0xff: "edi",
    }[modrm] ?? undefined
  );
}

function extractAsciiStrings(buffer, image) {
  const strings = [];

  for (const section of image.sections) {
    const rawStart = section.rawPointer;
    const rawEnd = Math.min(buffer.length, section.rawPointer + section.rawSize);
    let start = undefined;

    for (let offset = rawStart; offset <= rawEnd; offset += 1) {
      const byte = offset < rawEnd ? buffer[offset] : 0;
      const printable = byte >= 0x20 && byte <= 0x7e;

      if (printable) {
        start ??= offset;
        continue;
      }

      if (start !== undefined && offset - start >= ASCII_MIN_LENGTH) {
        strings.push({
          section: section.name,
          rawOffset: toHex(start),
          va: toHex(image.rawOffsetToVa(start)),
          value: readCString(buffer, start),
        });
      }
      start = undefined;
    }
  }

  return strings;
}

function resolveString(buffer, image, immediate, immediateHex, stringsByVa) {
  const knownString = stringsByVa.get(immediateHex)?.value;
  if (knownString) {
    return knownString;
  }

  const rawOffset = image.vaToRawOffset(immediate);
  if (rawOffset === undefined) {
    return undefined;
  }

  const value = readCString(buffer, rawOffset);
  if (value.length >= 2 && value.includes("%") && /^[\x20-\x7e]+$/.test(value)) {
    return value;
  }

  return undefined;
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
  console.log(`Original UI layout static evidence: ${report.executablePath}`);
  console.log(`  image base: ${report.imageBase}`);

  for (const probe of report.probes) {
    console.log(`  ${probe.startVa}-${probe.endVa} ${probe.id}`);
    for (const event of probe.pushStrings) {
      console.log(`    ${event.va} push ${event.string}`);
    }
    for (const write of probe.stackWrites) {
      console.log(`    ${write.va} stack[${write.stackOffset}] = ${write.immediate}`);
    }
  }
}
