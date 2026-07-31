import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01ClockSelectorInitializationEvidence,
  replayColdStartSelector,
} from "./extract-k01-clock-selector-initialization-evidence.mjs";

const root = resolve(import.meta.dirname, "../..");
const paths = {
  executablePath: join(root, "original/imjinrok2/imjinrok2.exe"),
  functionsPath: join(root, "analysis/generated/imjinrok2/functions.json"),
  referencesPath: join(root, "analysis/generated/imjinrok2/references.json"),
};
const fixturePath = join(root, "analysis/fixtures/k01-clock-selector-initialization-evidence.json");

test("extracts the canonical cold-start selector initialization fixture", () => {
  assert.deepEqual(extractK01ClockSelectorInitializationEvidence(), JSON.parse(readFileSync(fixturePath, "utf8")));
});

test("replays load failure, persisted selector retention, and the consumer boundary", () => {
  assert.deepEqual(replayColdStartSelector({ configLoadSucceeded: false }), { selector: 2, source: "initializer-after-load-failure" });
  assert.deepEqual(replayColdStartSelector({ configLoadSucceeded: true, persistedSelector: 3 }), { selector: 3, source: "config-hq-transfer" });
  const report = extractK01ClockSelectorInitializationEvidence();
  assert.deepEqual(report.testVectors, [
    { id: "load-failure-initializes-selector-two", input: { configLoadSucceeded: false }, result: { selector: 2, source: "initializer-after-load-failure" }, consumer: { modeWord: 0, baseIntervalMs: 50 } },
    { id: "load-success-retains-persisted-selector-byte-range", input: { configLoadSucceeded: true, persistedSelector: 3 }, result: { selector: 3, source: "config-hq-transfer" }, consumer: { modeWord: 0, baseIntervalMs: 40 } },
    { id: "mode-one-consumer-bypasses-selector", input: { modeWord: 1, selector: 0 }, result: { baseIntervalMs: 50 } },
  ]);
  assert.match(report.selectorConsumerBoundary.nonClaim, /not claim every K01 session is fixed/u);
  assert.match(report.selectorConsumerBoundary.laterOptionBoundary, /FUN_004ac480\/FUN_004ac490/u);
});

test("rejects malformed replay values and independently tampered static inputs", (t) => {
  assert.throws(() => replayColdStartSelector({ configLoadSucceeded: 0 }), /boolean/u);
  assert.throws(() => replayColdStartSelector({ configLoadSucceeded: true, persistedSelector: -1 }), /unsigned DWORD/u);

  const directory = mkdtempSync(join(tmpdir(), "k01-clock-selector-init-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const executablePath = join(directory, "imjinrok2.exe");
  copyFileSync(paths.executablePath, executablePath);
  const bytes = readFileSync(executablePath);
  bytes[bytes.length - 1] ^= 1;
  writeFileSync(executablePath, bytes);
  assert.throws(() => extractK01ClockSelectorInitializationEvidence({ ...paths, executablePath }), /SHA-256/u);

  const functionsPath = copyWithReplacement(directory, paths.functionsPath, "eeee18b6012892ee3e108fadc425827e06bbb185ba583aeb6f514c16fbb74802", "0".repeat(64));
  assert.throws(() => extractK01ClockSelectorInitializationEvidence({ ...paths, functionsPath }), /functions artifact SHA-256/u);
  const referencesPath = copyWithReplacement(directory, paths.referencesPath, '"from": "0x0043f728"', '"from": "0x0043f729"');
  assert.throws(() => extractK01ClockSelectorInitializationEvidence({ ...paths, referencesPath }), /references artifact SHA-256/u);
});

function copyWithReplacement(directory, source, expected, replacement) {
  assert.equal(expected.length, replacement.length, "replacement preserves artifact byte length");
  const destination = join(directory, `${Math.random().toString(16).slice(2)}.json`);
  const text = readFileSync(source, "utf8");
  assert.ok(text.includes(expected), `missing fixture text ${expected}`);
  writeFileSync(destination, text.replace(expected, replacement));
  return destination;
}
