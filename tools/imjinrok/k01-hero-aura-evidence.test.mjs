import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { extractK01HeroAuraEvidence } from "./extract-k01-hero-aura-evidence.mjs";

test("K01 hero aura extractor records only bounded static facts and explicit blockers", () => {
  const report = extractK01HeroAuraEvidence();
  const fixture = JSON.parse(readFileSync("analysis/fixtures/k01-hero-aura-evidence.json", "utf8"));
  assert.deepEqual(report, fixture);
  assert.equal(report.evidenceStatus, "unverified-k01-hero-aura");
  assert.equal(report.confirmedInputs.resourceCandidate.spriteSlot, 96);
  assert.equal(report.unresolvedScope.length, 4);
});

test("K01 hero aura extractor rejects altered original inputs", () => {
  const directory = mkdtempSync(join(tmpdir(), "k01-hero-aura-"));
  const altered = join(directory, "eventmark.spr");
  copyFileSync("original/imjinrok2/fnt/eventmark.spr", altered);
  const bytes = readFileSync(altered);
  bytes[0] ^= 0xff;
  writeFileSync(altered, bytes);
  assert.throws(() => extractK01HeroAuraEvidence({ eventMarkPath: altered }), /SHA-256/);
});
