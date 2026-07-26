import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  EXPECTED_EXECUTABLE_SHA256,
  extractEntityTypeCatalog,
} from "./extract-entity-type-catalog.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const executablePath = join(
  repositoryRoot,
  "original/imjinrok2/imjinrok2.exe",
);
const seedsPath = join(
  repositoryRoot,
  "analysis/generated/imjinrok2/seeds.json",
);
const generatedCatalogPath = join(
  repositoryRoot,
  "analysis/generated/entity-type-catalog.json",
);

test("extracts every original entity type identity from static data flow", () => {
  const report = extractEntityTypeCatalog({ executablePath, seedsPath });

  assert.deepEqual(report.summary, {
    typeCount: 95,
    minimumClass: 1,
    maximumClass: 95,
    uniqueOriginalNameCount: 95,
    uniqueSpritePathCount: 93,
    sharedSpritePathCount: 2,
    baseFrameZeroCount: 58,
    baseFrameSevenCount: 35,
    otherBaseFrameCount: 2,
  });
  assert.equal(report.source.executableSha256, EXPECTED_EXECUTABLE_SHA256);
  assert.ok(report.codeAnchors.every((anchor) => anchor.matched));
  assert.deepEqual(
    report.types.map((type) => type.internalClass),
    Array.from({ length: 95 }, (_value, index) => index + 1),
  );

  assertTypeIdentity(report, 2, {
    name: "조선 창병",
    slot: 100,
    baseFrame: 0,
    sourcePath: "char\\swordk.spr",
  });
  assertTypeIdentity(report, 3, {
    name: "일본 창병",
    slot: 101,
    baseFrame: 0,
    sourcePath: "char\\swordj.spr",
  });
  assertTypeIdentity(report, 42, {
    name: "조선 화포망루",
    slot: 128,
    baseFrame: 7,
    sourcePath: "char\\towerk.spr",
  });
  assertTypeIdentity(report, 49, {
    name: "조선 본영",
    slot: 141,
    baseFrame: 7,
    sourcePath: "char\\hqk.spr",
  });
  assertTypeIdentity(report, 52, {
    name: "조선 봉화대",
    slot: 113,
    baseFrame: 7,
    sourcePath: "char\\firehousek.spr",
  });
  assertTypeIdentity(report, 76, {
    name: "조선 권율",
    slot: 153,
    baseFrame: 0,
    sourcePath: "char\\generalk11.spr",
  });
  assertTypeIdentity(report, 78, {
    name: "조선 유성룡",
    slot: 158,
    baseFrame: 0,
    sourcePath: "char\\generalk31.spr",
  });
  assertTypeIdentity(report, 79, {
    name: "조선 사명대사",
    slot: 160,
    baseFrame: 0,
    sourcePath: "char\\generalk4.spr",
  });
});

test("preserves shared source identities instead of forcing a unique binding", () => {
  const report = extractEntityTypeCatalog({ executablePath, seedsPath });
  const classesBySourcePath = groupBy(
    report.types,
    (type) => type.sprite.sourcePathNormalized,
  );

  assert.deepEqual(
    classesBySourcePath
      .get("char/farmerk.spr")
      ?.map((type) => [type.internalClass, type.originalGameplayName]),
    [
      [7, "조선 농부"],
      [93, "솜씨 좋은 도공"],
    ],
  );
  assert.deepEqual(
    classesBySourcePath
      .get("char/generalk51.spr")
      ?.map((type) => [type.internalClass, type.originalGameplayName]),
    [
      [80, "조선 곽재우"],
      [81, "조선 곽재우분신"],
    ],
  );
});

test("generated entity type catalog is deterministic and current", () => {
  const generated = JSON.parse(readFileSync(generatedCatalogPath, "utf8"));
  const regenerated = extractEntityTypeCatalog();

  assert.deepEqual(generated, regenerated);
});

test("rejects static analysis produced from another executable", (t) => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "entity-type-catalog-"),
  );
  t.after(() =>
    rmSync(temporaryDirectory, { recursive: true, force: true }),
  );

  const mismatchedSeeds = JSON.parse(readFileSync(seedsPath, "utf8"));
  mismatchedSeeds.sourceSha256 = "0".repeat(64);
  const mismatchedSeedsPath = join(temporaryDirectory, "seeds.json");
  writeFileSync(
    mismatchedSeedsPath,
    `${JSON.stringify(mismatchedSeeds)}\n`,
  );

  assert.throws(
    () =>
      extractEntityTypeCatalog({
        executablePath,
        seedsPath: mismatchedSeedsPath,
      }),
    /source SHA-256 mismatch/,
  );
});

function assertTypeIdentity(report, internalClass, expected) {
  const type = report.types.find(
    (candidate) => candidate.internalClass === internalClass,
  );
  assert.ok(type, `missing internal class ${internalClass}`);
  assert.equal(type.originalGameplayName, expected.name);
  assert.equal(type.sprite.slot, expected.slot);
  assert.equal(type.sprite.baseFrame, expected.baseFrame);
  assert.equal(type.sprite.sourcePath, expected.sourcePath);
}

function groupBy(values, selectKey) {
  const groups = new Map();
  for (const value of values) {
    const key = selectKey(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }
  return groups;
}
