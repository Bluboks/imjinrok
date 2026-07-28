#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseSpriteLikeHeader } from "./codec.mjs";
import { readPeImage, toHex } from "./pe-image.mjs";

export const EXPECTED_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const EXPECTED_ASSET_SHA256 = {
  winLogo:
    "045b64ce026386413098f339681e8ac859e641c2e28d86d6dc2a25e4fa84851e",
  loseLogo:
    "94a33a66783eaa9ab4f458542707cc5fa81ea29c0057eabb3a659fdc39d78ad7",
  winAudio:
    "d50d4146bd5c423b78ea41ac83d6cd737b083586afff48a7761024dfee1bc61d",
  loseAudio:
    "deb38aae3e4d034774d79953189cfa51408a61d25232abb72f72affca80833e6",
};

const QUESTION =
  "For a K01 result already committed as raw state 0x18 or 0x1a, what exact shared teardown order has already run, how do main-loop states 0x18/0x19 and 0x1a/0x1b initialize and poll the two original result presentations across unsigned 32-bit timing and exact completion gates, how does the 0x8c→0x96 target-state relay reach the shared 0x1c/0x1d post-result path, and how does the final consumer route by external-mode, result flag, campaign stage, WORD wrap, and overwrite precedence?";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const DEFAULT_PATHS = {
  input: resolve(repositoryRoot, "original/imjinrok2/imjinrok2.exe"),
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
  winLogo: resolve(repositoryRoot, "original/imjinrok2/yfnt/winlogo.spr"),
  loseLogo: resolve(
    repositoryRoot,
    "original/imjinrok2/yfnt/loselogo.spr",
  ),
  winAudio: resolve(repositoryRoot, "original/imjinrok2/music/win.YAV"),
  loseAudio: resolve(repositoryRoot, "original/imjinrok2/music/lose.YAV"),
};

const EXPECTED_FUNCTIONS = new Map([
  [
    0x00446420,
    [
      "0x00446420-0x004464be",
      33,
      9,
      "439694b6de69137d87c47d6687e97d8a74f2ad073c808b443606a0b42906910a",
    ],
  ],
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
    0x00493290,
    [
      "0x00493290-0x0049329e",
      5,
      1,
      "1ea8ffe512653b2969ff443fcd05080b27100d289cbb3556cc90c26cb42c2cba",
    ],
  ],
  [
    0x004932a0,
    [
      "0x004932a0-0x004932b4",
      9,
      1,
      "558b261cb05641704769a9486e726df60760519bfd0cb8941c33612622b97159",
    ],
  ],
  [
    0x004932c0,
    [
      "0x004932c0-0x004932ce",
      5,
      1,
      "4696a43d2ed7740cbc445e1fa67882a2f24c1676855bcfecc101edee070d72d0",
    ],
  ],
  [
    0x004932d0,
    [
      "0x004932d0-0x004932e4",
      9,
      1,
      "d19c6d9e3b1783c591a2b4135022ac8c2bac5b182183c4fa91f0d82e23c2dff1",
    ],
  ],
  [
    0x004932f0,
    [
      "0x004932f0-0x004933f4",
      69,
      8,
      "c75f5051d72e78e8797baabceceb3007a88f2220eae8bbccc9ca9989e3da1ee9",
    ],
  ],
  [
    0x00493400,
    [
      "0x00493400-0x00493534",
      99,
      13,
      "eea3fdcdd7ef8f773323c18a78da31223ac73a3a5c9209d34be98ebe1da58fb9",
    ],
  ],
  [
    0x00493540,
    [
      "0x00493540-0x00493596",
      25,
      7,
      "8fa4d6023b1df5ee617a3efb55c92ee0413c9e0fcecaed84bae38ef983cb648f",
    ],
  ],
]);

const REQUIRED_CALL_EDGES = [
  [0x004481fe, 0x004481d0, 0x00446420],
  [0x00448218, 0x004481d0, 0x00446420],
  [0x00446447, 0x00446420, 0x004145b0],
  [0x0044644e, 0x00446420, 0x0046f870],
  [0x00446458, 0x00446420, 0x004400b0],
  [0x00446460, 0x00446420, 0x00483c30],
  [0x00446465, 0x00446420, 0x00411190],
  [0x0044646a, 0x00446420, 0x00401ad0],
  [0x0044647e, 0x00446420, 0x00474ae0],
  [0x00446491, 0x00446420, 0x00482390],
  [0x004464a0, 0x00446420, 0x004823d0],
  [0x004464aa, 0x00446420, 0x004823a0],
  [0x00460164, 0x0045f9c0, 0x00493290],
  [0x0046019a, 0x0045f9c0, 0x0043fbe0],
  [0x004601a5, 0x0045f9c0, 0x0043fb30],
  [0x004601af, 0x0045f9c0, 0x0043f670],
  [0x004601b9, 0x0045f9c0, 0x004932a0],
  [0x004601c3, 0x0045f9c0, 0x004932c0],
  [0x004601d6, 0x0045f9c0, 0x004932d0],
  [0x004601e0, 0x0045f9c0, 0x00480180],
  [0x004601ff, 0x0045f9c0, 0x004615a0],
  [0x00460204, 0x0045f9c0, 0x00480300],
  [0x00460240, 0x0045f9c0, 0x00409790],
  [0x00460525, 0x0045f9c0, 0x004407d0],
  [0x00460538, 0x0045f9c0, 0x00440860],
  [0x00493292, 0x00493290, 0x004932f0],
  [0x004932a2, 0x004932a0, 0x00493400],
  [0x004932c2, 0x004932c0, 0x004932f0],
  [0x004932d2, 0x004932d0, 0x00493400],
  [0x00493328, 0x004932f0, 0x00442dd0],
  [0x00493337, 0x004932f0, 0x004434a0],
  [0x00493352, 0x004932f0, 0x0044b040],
  [0x00493369, 0x004932f0, 0x00442dd0],
  [0x00493388, 0x004932f0, 0x00442dd0],
  [0x00493397, 0x004932f0, 0x004434a0],
  [0x004933b2, 0x004932f0, 0x0044b040],
  [0x004933c9, 0x004932f0, 0x00442dd0],
  [0x004933d7, 0x004932f0, 0x00440fd0],
  [0x004933e9, 0x004932f0, 0x004414a0],
  [0x00493447, 0x00493400, 0x0044ab10],
  [0x004934d7, 0x00493400, 0x00450c10],
  [0x004934e3, 0x00493400, 0x0044ab60],
  [0x00493525, 0x00493400, 0x00493540],
  [0x0049354e, 0x00493540, 0x00443440],
  [0x00493562, 0x00493540, 0x00441b50],
  [0x00493575, 0x00493540, 0x004413c0],
  [0x00493584, 0x00493540, 0x00441550],
];

const CODE_ANCHORS = [
  {
    id: "main-loop-zero-register-producer",
    va: 0x0045fa40,
    bytes: "33 ed",
  },
  {
    id: "main-loop-target-relay-state-producer",
    va: 0x0045fc83,
    bytes: "bb 8c 00 00 00",
  },
  {
    id: "main-loop-exact-one-register-producer",
    va: 0x0045fd1e,
    bytes: "be 01 00 00 00",
  },
  {
    id: "shared-session-teardown-complete-order",
    va: 0x00446420,
    bytes:
      "a1 c0 4a 63 00 c7 05 bc df 4b 00 32 00 00 00 83 f8 01 66 c7 05 44 cc bc 00 00 00 75 0f c7 05 74 6e c0 00 01 00 00 00 e8 64 e1 fc ff 6a 02 e8 1d 94 02 00 68 b8 20 5e 00 e8 53 9c ff ff 83 c4 08 e8 cb d7 03 00 e8 26 ad fc ff e8 61 b6 fb ff 66 83 3d 20 6e c0 00 01 75 13 b9 68 b0 a9 00 e8 5d e6 02 00 66 c7 05 20 6e c0 00 00 00 b9 08 be bc 00 e8 fa be 03 00 83 f8 01 75 0a b9 08 be bc 00 e8 2b bf 03 00 b9 08 be bc 00 e8 f1 be 03 00 83 f8 01 75 0a b9 08 be bc 00 e9 52 bb 03 00 c3",
  },
  {
    id: "main-result-initialize-and-poll-cases",
    va: 0x00460164,
    bytes:
      "e8 27 31 03 00 66 a1 cc af 88 00 66 c7 05 c8 df 4b 00 19 00 66 3b c5 0f 84 07 fb ff ff 0f bf c0 99 b9 0a 00 00 00 f7 f9 b9 b8 4a 63 00 52 66 8b 15 ce af 88 00 52 e8 41 fa fd ff 50 b9 b8 4a 63 00 e8 86 f9 fd ff b9 b8 4a 63 00 e8 bc f4 fd ff e9 cf fa ff ff e8 e2 30 03 00 e9 7c fc ff ff e8 f8 30 03 00 66 c7 05 c8 df 4b 00 1b 00 e9 b2 fa ff ff e8 f5 30 03 00 e9 5f fc ff ff",
  },
  {
    id: "shared-post-result-routing-and-overwrites",
    va: 0x004601e0,
    bytes:
      "e8 9b ff 01 00 66 c7 05 c8 df 4b 00 1d 00 e9 95 fa ff ff 66 a1 14 66 7c 00 b9 d8 5e 7c 00 50 e8 9c 13 00 00 e8 f7 00 02 00 0f bf c8 3b cd 0f 84 74 fa ff ff 39 35 38 6e c0 00 75 09 66 c7 05 c8 df 4b 00 0a 00 39 35 48 c5 4c 00 75 2d 66 39 35 14 66 7c 00 75 03 56 eb 02 6a 02 b9 b0 af 4c 00 e8 4b 95 fa ff 66 c7 05 a0 6d c0 00 40 01 66 89 1d c8 df 4b 00 e9 2e fa ff ff 66 a1 cc af 88 00 66 3b c5 74 4d 66 39 35 14 66 7c 00 75 36 66 3d 08 00 74 22 66 3d 12 00 74 1c 66 3d 1b 00 74 16 66 40 66 c7 05 c8 df 4b 00 10 00 66 a3 cc af 88 00 e9 f2 f9 ff ff 66 c7 05 c8 df 4b 00 64 00 e9 e4 f9 ff ff 66 c7 05 c8 df 4b 00 20 00 e9 d6 f9 ff ff 66 89 0d c8 df 4b 00 e9 ca f9 ff ff",
  },
  {
    id: "target-state-relay-0x8c-0x96",
    va: 0x00460525,
    bytes:
      "e8 a6 02 fe ff 66 c7 05 c8 df 4b 00 96 00 e9 50 f7 ff ff e8 23 03 fe ff 3b c6 0f 85 43 f7 ff ff 66 a1 a0 6d c0 00 66 a3 c8 df 4b 00 e9 32 f7 ff ff",
  },
  {
    id: "presentation-clock-reset-and-exact-selector",
    va: 0x004932f0,
    bytes:
      "81 ec 00 04 00 00 66 c7 05 a8 9b c7 00 00 00 ff 15 70 72 4b 00 a3 a4 9b c7 00 a3 a0 9b c7 00 83 bc 24 04 04 00 00 01 75 60",
  },
  {
    id: "presentation-unsigned-cadence-and-completion",
    va: 0x0049344c,
    bytes:
      "8b 1d 70 72 4b 00 83 f8 01 0f 85 8d 00 00 00 ff d3 2b 05 a4 9b c7 00 83 f8 32 76 18 66 83 3d a8 9b c7 00 14 7d 0e 66 ff 05 a8 9b c7 00 ff d3 a3 a4 9b c7 00 0f bf 0d a8 9b c7 00 c1 e1 02 0f bf 81 e8 88 4c 00 0f bf 89 ea 88 4c 00 8d 14 40 c1 e2 07 2b d0 8d 0c 51 8d 14 40 c1 e2 07 2b d0 8b 04 8d 70 a0 c7 00 8b 0c d5 a4 a7 c7 00 8b 15 b4 9b c7 00 03 c1 8b 0d b8 9b c7 00 50 51 0f bf c7 0f bf ce 52 50 51 b9 18 94 55 00 e8 34 d7 fb ff 6a 00 b9 18 94 55 00 e8 78 76 fb ff ff d3 8b 15 a0 9b c7 00 5f 2b c2 5b 3d d0 07 00 00 76 36 a1 3c 6e c0 00 85 c0 75 21 8b 35 bc 71 4b 00 6a 1b ff d6 66 85 c0 7c 12 6a 0d ff d6 66 85 c0 7c 09 6a 20 ff d6 66 85 c0 7d 0c e8 16 00 00 00 b8 01 00 00 00 5e c3 33 c0 5e c3",
  },
  {
    id: "presentation-cleanup-exact-order",
    va: 0x00493540,
    bytes:
      "a1 a4 a7 c7 00 85 c0 74 0d 68 b0 9b c7 00 e8 ed fe fa ff 83 c4 04 a1 a8 a7 c7 00 85 c0 74 37 6a 00 50 e8 e9 e5 fa ff 83 c4 08 83 f8 01 75 0e a1 a8 a7 c7 00 50 e8 46 de fa ff 83 c4 04 8b 0d a8 a7 c7 00 51 e8 c7 df fa ff 83 c4 04 c7 05 a8 a7 c7 00 00 00 00 00 c3",
  },
];

const EXPECTED_STRINGS = new Map([
  ["0x004c8978", "yfnt\\winlogo.spr"],
  ["0x004c8960", "music\\win.YAV"],
  ["0x004c894c", "yfnt\\loselogo.spr"],
  ["0x004c893c", "music\\lose.YAV"],
]);

export function runSharedSessionTeardown({
  raw634ac0,
  rawC06e20,
  scriptPostState,
  scriptBusy,
}) {
  validateUnsigned32(raw634ac0, "raw634ac0");
  validateUnsigned16(rawC06e20, "rawC06e20");
  validateUnsigned32(scriptPostState, "scriptPostState");
  validateUnsigned32(scriptBusy, "scriptBusy");
  const events = [
    { kind: "write-dword", address: "0x004bdfbc", value: 0x32 },
    { kind: "write-word", address: "0x00bccc44", value: 0 },
  ];
  if (raw634ac0 === 1) {
    events.push(
      { kind: "write-dword", address: "0x00c06e74", value: 1 },
      { kind: "call", target: "0x004145b0" },
    );
  }
  events.push(
    { kind: "call", target: "0x0046f870", arguments: [2] },
    { kind: "call", target: "0x004400b0", arguments: [0x005e20b8] },
    { kind: "call", target: "0x00483c30" },
    { kind: "call", target: "0x00411190" },
    { kind: "call", target: "0x00401ad0" },
  );
  if (rawC06e20 === 1) {
    events.push(
      { kind: "call", target: "0x00474ae0", ecx: 0x00a9b068 },
      { kind: "write-word", address: "0x00c06e20", value: 0 },
    );
  }
  events.push({
    kind: "call-result",
    target: "0x00482390",
    ecx: 0x00bcbe08,
    value: scriptPostState,
  });
  if (scriptPostState === 1) {
    events.push({
      kind: "call",
      target: "0x004823d0",
      ecx: 0x00bcbe08,
    });
  }
  events.push({
    kind: "call-result",
    target: "0x004823a0",
    ecx: 0x00bcbe08,
    value: scriptBusy,
  });
  if (scriptBusy === 1) {
    events.push({
      kind: "tail-jump",
      target: "0x00482010",
      ecx: 0x00bcbe08,
    });
  }
  return { events, tailJumped: scriptBusy === 1 };
}

export function initializeResultPresentation({
  selector,
  timeSample,
  spriteLoadResult,
  audioHandle,
}) {
  validateUnsigned32(selector, "selector");
  validateUnsigned32(timeSample, "timeSample");
  validateUnsigned32(spriteLoadResult, "spriteLoadResult");
  validateUnsigned32(audioHandle, "audioHandle");
  const win = selector === 1;
  const spritePath = win ? "yfnt\\winlogo.spr" : "yfnt\\loselogo.spr";
  const audioPath = win ? "music\\win.YAV" : "music\\lose.YAV";
  const events = [
    { kind: "write-word", address: "0x00c79ba8", value: 0 },
    { kind: "timeGetTime", value: timeSample },
    { kind: "write-dword", address: "0x00c79ba4", value: timeSample },
    { kind: "write-dword", address: "0x00c79ba0", value: timeSample },
    { kind: "path-build", path: spritePath },
    { kind: "sprite-load-result", path: spritePath, value: spriteLoadResult },
  ];
  if (spriteLoadResult === 0) {
    events.push({ kind: "optional-load-failure-log", token: "WINLOSE" });
  }
  events.push(
    { kind: "path-build", path: audioPath },
    {
      kind: "audio-create-result",
      path: audioPath,
      arguments: [1, 0],
      value: audioHandle,
    },
    { kind: "write-dword", address: "0x00c7a7a8", value: audioHandle },
    {
      kind: "call",
      target: "0x004414a0",
      arguments: [audioHandle, 0, 0],
    },
  );
  return {
    phase: 0,
    cadenceClock: timeSample >>> 0,
    startClock: timeSample >>> 0,
    spritePath,
    audioPath,
    audioHandle: audioHandle >>> 0,
    events,
  };
}

export function mapPresentationPollWrapperResult(pollResultEax) {
  validateUnsigned32(pollResultEax, "pollResultEax");
  return pollResultEax === 1 ? 0x1c : 0;
}

export function pollResultPresentation({
  activeDword,
  uiHelperResult,
  phase,
  cadenceClock,
  startClock,
  timeSamples,
  finishFlag,
  keyStates = [],
  cleanupInput,
}) {
  validateUnsigned32(activeDword, "activeDword");
  validateUnsigned32(uiHelperResult, "uiHelperResult");
  validateIntegerRange(phase, 0, 20, "phase");
  validateUnsigned32(cadenceClock, "cadenceClock");
  validateUnsigned32(startClock, "startClock");
  validateUnsigned32(finishFlag, "finishFlag");
  validateUnsigned32Array(timeSamples, "timeSamples");
  validateSigned16Array(keyStates, "keyStates");
  const samples = [...timeSamples];
  const events = [];
  let nextPhase = phase;
  let nextCadenceClock = cadenceClock >>> 0;
  if (activeDword === 0) {
    requireConsumed(samples, "timeSamples");
    requireConsumed(keyStates, "keyStates");
    return {
      returnValue: 0,
      phase: nextPhase,
      cadenceClock: nextCadenceClock,
      events,
    };
  }

  events.push({
    kind: "ui-helper-result",
    target: "0x0044ab10",
    value: uiHelperResult,
  });
  if (uiHelperResult === 1) {
    const cadenceSample = shiftSample(samples, "cadence sample");
    events.push({ kind: "timeGetTime", purpose: "cadence", value: cadenceSample });
    const cadenceDelta = (cadenceSample - nextCadenceClock) >>> 0;
    events.push({ kind: "cadence-delta", value: cadenceDelta });
    if (cadenceDelta > 50 && nextPhase < 20) {
      nextPhase = toSigned16((nextPhase + 1) & 0xffff);
      events.push({ kind: "phase-increment", value: nextPhase });
      const updateSample = shiftSample(samples, "cadence update sample");
      events.push({
        kind: "timeGetTime",
        purpose: "cadence-clock-update",
        value: updateSample,
      });
      nextCadenceClock = updateSample >>> 0;
      events.push({
        kind: "write-dword",
        address: "0x00c79ba4",
        value: nextCadenceClock,
      });
    }
    events.push({
      kind: "draw-table-pair",
      tableIndex: nextPhase,
      pair: [0, nextPhase],
    });
  }

  const completionSample = shiftSample(samples, "completion sample");
  events.push({
    kind: "timeGetTime",
    purpose: "completion",
    value: completionSample,
  });
  const completionDelta = (completionSample - startClock) >>> 0;
  events.push({ kind: "completion-delta", value: completionDelta });
  if (completionDelta <= 0x7d0) {
    requireConsumed(samples, "timeSamples");
    requireConsumed(keyStates, "keyStates");
    return {
      returnValue: 0,
      phase: nextPhase,
      cadenceClock: nextCadenceClock,
      events,
    };
  }

  let finish = finishFlag !== 0;
  events.push({ kind: "finish-flag-read", value: finishFlag });
  const remainingKeyStates = [...keyStates];
  if (!finish) {
    for (const key of [0x1b, 0x0d, 0x20]) {
      const value = shiftKeyState(remainingKeyStates, key);
      events.push({ kind: "GetAsyncKeyState", key, value });
      if (value < 0) {
        finish = true;
        break;
      }
    }
  }
  requireConsumed(samples, "timeSamples");
  if (!finish) {
    requireConsumed(remainingKeyStates, "keyStates");
    return {
      returnValue: 0,
      phase: nextPhase,
      cadenceClock: nextCadenceClock,
      events,
    };
  }
  requireConsumed(remainingKeyStates, "keyStates");
  const cleanup = runResultPresentationCleanup(cleanupInput);
  events.push({ kind: "cleanup-call", target: "0x00493540" }, ...cleanup.events);
  return {
    returnValue: 1,
    phase: nextPhase,
    cadenceClock: nextCadenceClock,
    events,
    cleanup,
  };
}

export function runResultPresentationCleanup({
  spriteHandle,
  audioHandle,
  audioStopResult,
}) {
  validateUnsigned32(spriteHandle, "spriteHandle");
  validateUnsigned32(audioHandle, "audioHandle");
  validateUnsigned32(audioStopResult, "audioStopResult");
  const events = [];
  if (spriteHandle !== 0) {
    events.push({
      kind: "call",
      target: "0x00443440",
      arguments: [0x00c79bb0],
    });
  }
  if (audioHandle !== 0) {
    events.push({
      kind: "call-result",
      target: "0x00441b50",
      arguments: [audioHandle, 0],
      value: audioStopResult,
    });
    if (audioStopResult === 1) {
      events.push({
        kind: "call",
        target: "0x004413c0",
        arguments: [audioHandle],
      });
    }
    events.push(
      {
        kind: "call",
        target: "0x00441550",
        arguments: [audioHandle],
      },
      { kind: "write-dword", address: "0x00c7a7a8", value: 0 },
    );
  }
  return { audioHandle: 0, events };
}

export function initializeCommittedResultState({
  currentState,
  stageWord,
  rawStageCompanionWord,
}) {
  validateUnsigned16(currentState, "currentState");
  validateUnsigned16(stageWord, "stageWord");
  validateUnsigned16(rawStageCompanionWord, "rawStageCompanionWord");
  if (currentState !== 0x18 && currentState !== 0x1a) {
    throw new RangeError("currentState must be 0x18 or 0x1a");
  }
  const events = [];
  if (currentState === 0x1a) {
    events.push(
      { kind: "call", target: "0x004932c0", selector: 0 },
      { kind: "write-word", address: "0x004bdfc8", value: 0x1b },
    );
    return { currentState: 0x1b, events };
  }
  events.push(
    { kind: "call", target: "0x00493290", selector: 1 },
    { kind: "write-word", address: "0x004bdfc8", value: 0x19 },
  );
  if (stageWord !== 0) {
    const signedStage = toSigned16(stageWord);
    const quotient = Math.trunc(signedStage / 10) || 0;
    const remainder = signedStage - quotient * 10;
    const combinedWordPush =
      ((remainder >>> 0) & 0xffff0000) | rawStageCompanionWord;
    events.push(
      {
        kind: "signed-idiv-10",
        stageSignedWord: signedStage,
        quotient,
        remainder,
      },
      {
        kind: "call",
        target: "0x0043fbe0",
        rawPushOrder: [remainder >>> 0, combinedWordPush >>> 0],
      },
      { kind: "call", target: "0x0043fb30", argument: "prior EAX" },
      { kind: "call", target: "0x0043f670" },
    );
  }
  return { currentState: 0x19, events };
}

export function consumeResultPoll({
  currentState,
  pollResultEax,
}) {
  validateUnsigned16(currentState, "currentState");
  if (currentState !== 0x19 && currentState !== 0x1b) {
    throw new RangeError("currentState must be 0x19 or 0x1b");
  }
  const target = mapPresentationPollWrapperResult(pollResultEax);
  const events = [
    {
      kind: "call",
      target: currentState === 0x19 ? "0x004932a0" : "0x004932d0",
      fixedArgument: currentState === 0x19 ? 1 : 0,
      commonPollArgumentRead: false,
      returnedWord: target,
    },
  ];
  if (target === 0) return { currentState, targetState: undefined, events };
  events.push(
    { kind: "write-word", address: "0x00c06da0", value: target },
    { kind: "write-word", address: "0x004bdfc8", value: 0x8c },
  );
  return { currentState: 0x8c, targetState: target, events };
}

export function advanceTargetStateRelay({
  currentState,
  targetState,
  transitionPollResult,
}) {
  validateUnsigned16(currentState, "currentState");
  validateUnsigned16(targetState, "targetState");
  validateUnsigned32(transitionPollResult, "transitionPollResult");
  if (currentState === 0x8c) {
    return {
      currentState: 0x96,
      targetState,
      events: [
        { kind: "call", target: "0x004407d0" },
        { kind: "write-word", address: "0x004bdfc8", value: 0x96 },
      ],
    };
  }
  if (currentState !== 0x96) {
    throw new RangeError("currentState must be 0x8c or 0x96");
  }
  const events = [
    {
      kind: "call-result",
      target: "0x00440860",
      value: transitionPollResult,
    },
  ];
  if (transitionPollResult !== 1) {
    return { currentState: 0x96, targetState, events };
  }
  events.push({
    kind: "write-word",
    address: "0x004bdfc8",
    value: targetState,
  });
  return { currentState: targetState, targetState, events };
}

export function enterSharedPostResult() {
  return {
    currentState: 0x1d,
    events: [
      { kind: "call-return-ignored", target: "0x00480180" },
      { kind: "write-word", address: "0x004bdfc8", value: 0x1d },
    ],
  };
}

export function consumeFinalPostResult({
  resultFlag,
  postPollWord,
  transientGate,
  externalMode,
  stageWord,
}) {
  validateUnsigned16(resultFlag, "resultFlag");
  validateUnsigned16(postPollWord, "postPollWord");
  validateUnsigned32(transientGate, "transientGate");
  validateUnsigned32(externalMode, "externalMode");
  validateUnsigned16(stageWord, "stageWord");
  const events = [
    {
      kind: "call",
      target: "0x004615a0",
      ecx: 0x007c5ed8,
      argumentWord: resultFlag,
    },
    { kind: "call-result", target: "0x00480300", valueWord: postPollWord },
  ];
  if (postPollWord === 0) {
    return { currentState: 0x1d, stageWord, events };
  }
  if (transientGate === 1) {
    events.push({
      kind: "write-word",
      address: "0x004bdfc8",
      value: 0x0a,
      transient: true,
    });
  }
  if (externalMode === 1) {
    const route = resultFlag === 1 ? 1 : 2;
    events.push(
      { kind: "call", target: "0x00409790", route },
      { kind: "write-word", address: "0x00c06da0", value: 0x140 },
      { kind: "write-word", address: "0x004bdfc8", value: 0x8c },
    );
    return { currentState: 0x8c, targetState: 0x140, stageWord, events };
  }
  if (stageWord === 0) {
    events.push({
      kind: "write-word",
      address: "0x004bdfc8",
      value: postPollWord,
    });
    return { currentState: postPollWord, stageWord, events };
  }
  if (resultFlag !== 1) {
    events.push({
      kind: "write-word",
      address: "0x004bdfc8",
      value: 0x20,
    });
    return { currentState: 0x20, stageWord, events };
  }
  if ([8, 0x12, 0x1b].includes(stageWord)) {
    events.push({
      kind: "write-word",
      address: "0x004bdfc8",
      value: 0x64,
    });
    return { currentState: 0x64, stageWord, events };
  }
  const nextStageWord = (stageWord + 1) & 0xffff;
  events.push(
    { kind: "write-word", address: "0x004bdfc8", value: 0x10 },
    { kind: "write-word", address: "0x0088afcc", value: nextStageWord },
  );
  return { currentState: 0x10, stageWord: nextStageWord, events };
}

export function extractK01FinalResultTransition(options = {}) {
  const paths = { ...DEFAULT_PATHS, ...options };
  const { buffer: executableBuffer, image } = readPeImage(paths.input);
  const executableSha256 = sha256(executableBuffer);
  assertEqual(
    executableSha256,
    EXPECTED_EXE_SHA256,
    "original executable SHA-256",
  );
  const documents = {
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
  validateSeedLabel(
    documents.seeds,
    0x00446420,
    "shared-session-teardown",
  );
  const analyzedFunctions = [...EXPECTED_FUNCTIONS].map(([entry, expected]) =>
    validateFunction(documents.seeds, documents.functions, entry, expected),
  );
  const callEdges = REQUIRED_CALL_EDGES.map(([site, caller, callee]) =>
    requireCallEdge(documents.seeds, documents.functions, site, caller, callee),
  );
  const tailEdge = requireInstruction(
    documents.seeds,
    0x00446420,
    0x004464b9,
    "JMP 0x00482010",
  );
  const codeAnchors = CODE_ANCHORS.map((anchor) =>
    validateCodeAnchor(executableBuffer, image, anchor),
  );
  const mainLoopDispatch = validateMainLoopJumpTables(documents.jumpTables);
  const sourceStrings = validateSourceStrings(documents.strings);
  const scopedReferences = validateScopedReferences(documents.references);
  const phaseTable = validatePhaseTable(executableBuffer, image);
  const sources = validateAssets(paths);
  validateCommonPollArgumentInvariant(documents.seeds);

  return {
    question: QUESTION,
    evidenceStatus: "static-proven-k01-final-result-transition",
    reproductionStatus: "reproduction-complete",
    integrationStatus:
      "gated-no-original-clock-result-policy-or-project-presentation-identity-mapping",
    source: { path: paths.input, sha256: executableSha256 },
    sources,
    analyzedFunctions,
    callEdges,
    tailEdge,
    codeAnchors,
    mainLoopDispatch,
    sourceStrings,
    scopedReferences,
    phaseTable,
    teardown: {
      stateWriteBeforeEntry:
        "prior 0x004481d0 evidence writes 0x18/0x1a before calling 0x00446420",
      sharedCallers: documents.functions.functions.find(
        ({ entry }) => entry === "0x00446420",
      ).callers,
      exactOnePredicates: [
        "DWORD 0x00634ac0",
        "WORD 0x00c06e20",
        "0x00482390 return",
        "0x004823a0 return",
      ],
    },
    presentation: {
      initializerSelectors: { win: 1, loss: "every other DWORD" },
      initializedPhase: 0,
      cadenceThreshold: "unsigned DWORD delta > 50",
      completionThreshold: "unsigned DWORD delta > 0x7d0",
      reachablePhaseContract:
        "initializer produces 0 and signed-WORD phase advances only through 20; reproduction rejects other input phases rather than reading unproven adjacent table data",
      wrapperContract:
        "common poll does not read the wrapper argument; exact EAX 1 maps to WORD 0x1c and every other EAX maps to 0",
    },
    relay:
      "poll completion writes target 0x1c and current 0x8c; 0x8c initializes opaque transition then current 0x96; only exact 0x00440860 EAX 1 copies target",
    finalConsumer: {
      externalModePrecedesStage: true,
      externalTarget: 0x140,
      specialStages: [8, 0x12, 0x1b],
      campaignIncrement: "WORD increment with 0xffff -> 0",
      transient0aAlwaysOverwrittenOnNonzeroPostPoll: true,
    },
    testVectors: [
      "teardown exact-one branches and tail-jump",
      "win/loss and non-one initializer selector",
      "cadence 50/51, phase 19/20, completion 2000/2001 and DWORD wrap",
      "finish flag and sequential 0x1b/0x0d/0x20 signed-AX keys",
      "cleanup exact-one and unconditional release order",
      "poll EAX 1/0/2/0xffffffff and 0x8c/0x96 relay",
      "external precedence, stage zero raw WORD, special/adjacent stages, 0xffff wrap, result non-one",
    ],
    uncertainties: [
      "FUN_004407d0 and FUN_00440860 human meanings are opaque beyond the exact relay contract",
      "FUN_00480180 and FUN_00480300 internals and producer semantics remain outside this unit",
      "the 21 raw table pairs are proven, but their exact correlation to the 28 SPR frames is not",
      "zero-reset lifecycle for 0x0084373c/0x00843740 remains unresolved; 0x0048df40 and 0x0048dfc0 are out-of-scope fallback timer producers",
      "original clocks and transition policy are not mapped to project 24 Hz or generic runtime state",
    ],
  };
}

function validateAssets(paths) {
  const output = {};
  for (const [id, expected] of Object.entries(EXPECTED_ASSET_SHA256)) {
    const buffer = readFileSync(paths[id]);
    assertEqual(sha256(buffer), expected, `${id} SHA-256`);
    output[id] = { path: paths[id], sha256: expected, size: buffer.length };
    if (id.endsWith("Logo")) {
      const header = parseSpriteLikeHeader(buffer, paths[id]);
      assertEqual(header.width, 250, `${id} width`);
      assertEqual(header.height, 100, `${id} height`);
      assertEqual(header.frameCount, 28, `${id} frame count`);
      output[id].header = {
        width: header.width,
        height: header.height,
        frameCount: header.frameCount,
      };
    }
  }
  return output;
}

function validateMainLoopJumpTables(document) {
  const low = document.tables?.find(
    ({ functionEntry, switchAddress }) =>
      functionEntry === "0x0045f9c0" &&
      switchAddress === "0x0045fd56",
  );
  const high = document.tables?.find(
    ({ functionEntry, switchAddress }) =>
      functionEntry === "0x0045f9c0" &&
      switchAddress === "0x0046042b",
  );
  if (!low || !high) throw new Error("Missing main-loop result jump table");
  assertEqual(low.cases.length, 35, "low main-loop jump-table case count");
  assertEqual(high.cases.length, 251, "high main-loop jump-table case count");
  const expected = [
    [23, "0x00460164", 0x18],
    [24, "0x004601b9", 0x19],
    [25, "0x004601c3", 0x1a],
    [26, "0x004601d6", 0x1b],
    [27, "0x004601e0", 0x1c],
    [28, "0x004601f3", 0x1d],
  ];
  const resultStates = expected.map(([label, destination, rawState]) => {
    const actual = low.cases.find((candidate) => candidate.label === label);
    assertDeepEqual(actual, { destination, label }, `state ${toHex(rawState)}`);
    return { rawState: toHex(rawState), label, destination };
  });
  const relayStates = [
    [0x8c, "0x00460525"],
    [0x96, "0x00460538"],
  ].map(([rawState, destination]) => {
    const actual = high.cases.find(
      (candidate) => candidate.label === rawState,
    );
    assertDeepEqual(
      actual,
      { destination, label: rawState },
      `relay ${toHex(rawState)}`,
    );
    return { rawState: toHex(rawState), label: rawState, destination };
  });
  return {
    resultSwitch: low.switchAddress,
    resultCaseCount: low.cases.length,
    resultStates,
    relaySwitch: high.switchAddress,
    relayCaseCount: high.cases.length,
    relayStates,
  };
}

function validateSourceStrings(document) {
  return [...EXPECTED_STRINGS].map(([address, value]) => {
    const entry = document.strings?.find(
      (candidate) => candidate.address === address,
    );
    if (!entry) throw new Error(`Missing result asset string ${address}`);
    assertEqual(entry.value, value, `${address} source string`);
    return { address, value, references: entry.references };
  });
}

function validateScopedReferences(document) {
  const expected = [
    ["0x004932ff", "0x004932f0", "0x004b7270", "READ", "PTR_timeGetTime_004b7270"],
    ["0x00493323", "0x004932f0", "0x004c8978", "DATA", "s_yfnt\\winlogo.spr_004c8978"],
    ["0x00493364", "0x004932f0", "0x004c8960", "DATA", "s_music\\win.YAV_004c8960"],
    ["0x00493383", "0x004932f0", "0x004c894c", "DATA", "s_yfnt\\loselogo.spr_004c894c"],
    ["0x004933c4", "0x004932f0", "0x004c893c", "DATA", "s_music\\lose.YAV_004c893c"],
    ["0x0049344c", "0x00493400", "0x004b7270", "READ", "PTR_timeGetTime_004b7270"],
    ["0x00493504", "0x00493400", "0x004b71bc", "READ", "PTR_GetAsyncKeyState_004b71bc"],
    ["0x0049348a", "0x00493400", "0x004c88e8", "DATA", "DAT_004c88e8"],
  ];
  return expected.map(([from, functionEntry, to, type, toSymbol]) => {
    const actual = document.references?.find(
      (candidate) =>
        candidate.from === from &&
        candidate.fromFunctionEntry === functionEntry &&
        candidate.to === to &&
        candidate.type === type,
    );
    if (!actual) {
      throw new Error(
        `Missing scoped reference ${from}: ${functionEntry} -> ${to} ${type}`,
      );
    }
    assertEqual(actual.toSymbol, toSymbol, `${from} reference symbol`);
    return { from, functionEntry, to, type, toSymbol };
  });
}

function validatePhaseTable(buffer, image) {
  const va = 0x004c88e8;
  const rawOffset = image.vaToRawOffset(va);
  if (rawOffset === undefined) throw new Error(`${toHex(va)} is not file-backed`);
  const pairs = Array.from({ length: 21 }, (_, index) => [
    buffer.readInt16LE(rawOffset + index * 4),
    buffer.readInt16LE(rawOffset + index * 4 + 2),
  ]);
  assertDeepEqual(
    pairs,
    Array.from({ length: 21 }, (_, index) => [0, index]),
    "result presentation phase table",
  );
  return { va: toHex(va), rawOffset: toHex(rawOffset), pairCount: 21, pairs };
}

function validateCommonPollArgumentInvariant(seeds) {
  const report = requireFunction(seeds, 0x00493400);
  const stackArgumentReads = report.instructions.filter(
    ({ text }) => /\[(?:E|e)SP \+ 0x[0-9a-f]+\]/i.test(text),
  );
  assertDeepEqual(
    stackArgumentReads,
    [],
    "0x00493400 stack argument reads",
  );
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
  return {
    address: toHex(address),
    functionEntry: toHex(functionEntry),
    text,
    bytes: instruction.bytes,
  };
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

function validateSeedLabel(document, address, expectedLabel) {
  const entry = document.seeds?.find(
    (candidate) => candidate.address === toHex(address),
  );
  if (!entry) throw new Error(`Missing configured seed ${toHex(address)}`);
  assertEqual(entry.label, expectedLabel, `${toHex(address)} seed label`);
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

function shiftSample(samples, label) {
  if (samples.length === 0) {
    throw new RangeError(`timeSamples is missing the ${label}`);
  }
  return samples.shift();
}

function shiftKeyState(keyStates, key) {
  if (keyStates.length === 0) {
    throw new RangeError(
      `keyStates is missing GetAsyncKeyState(0x${key.toString(16)})`,
    );
  }
  return keyStates.shift();
}

function requireConsumed(values, label) {
  if (values.length !== 0) {
    throw new RangeError(`${label} has ${values.length} unused value(s)`);
  }
}

function validateUnsigned32Array(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  values.forEach((value, index) =>
    validateUnsigned32(value, `${label}[${index}]`),
  );
}

function validateSigned16Array(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array`);
  values.forEach((value, index) =>
    validateIntegerRange(value, -0x8000, 0x7fff, `${label}[${index}]`),
  );
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

function toSigned16(value) {
  return (value << 16) >> 16;
}

function readAnalysisJson(path, label) {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed || typeof parsed.sourceSha256 !== "string") {
      throw new Error("missing sourceSha256");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Cannot read ${label} analysis from ${path}: ${error.message}`, {
      cause: error,
    });
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
  return [...buffer].map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.stdout.write(
    `${JSON.stringify(extractK01FinalResultTransition(), null, 2)}\n`,
  );
}
