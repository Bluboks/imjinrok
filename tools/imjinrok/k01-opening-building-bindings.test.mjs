import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01OpeningBuildingBindings,
  K01_PROVEN_OPENING_BUILDING_BINDINGS,
} from "./extract-k01-opening-building-bindings.mjs";

const root = resolve(import.meta.dirname, "../..");
const fixturePath = join(root, "analysis/fixtures/k01-opening-building-bindings.json");
const paths = {
  catalog: join(root, "analysis/generated/entity-type-catalog.json"),
  map: join(root, "original/imjinrok2/stagemap/k01.map"),
  spriteDirectory: join(root, "original/imjinrok2/char"),
};

test("recovers every canonical K01 opening building identity, base frame, source record, and sprite header", () => {
  const report = extractK01OpeningBuildingBindings();

  assert.equal(report.evidenceStatus, "exact-static-identity-source");
  assert.deepEqual(report.bindings, JSON.parse(readFileSync(fixturePath, "utf8")).bindings);
  assert.deepEqual(report.bindings, K01_PROVEN_OPENING_BUILDING_BINDINGS);
  assert.deepEqual(
    report.identities.map(({ internalClass, originalGameplayName, spriteSlot, baseFrame, sourcePath }) =>
      [internalClass, originalGameplayName, spriteSlot, baseFrame, sourcePath]),
    [
      [48, "조선 방앗간", 146, 7, "char\\millk.spr"],
      [49, "조선 본영", 141, 7, "char\\hqk.spr"],
      [51, "조선 훈련도감", 213, 7, "char\\advbarrackk.spr"],
      [58, "일본 본영", 106, 7, "char\\jhq.spr"],
      [60, "일본 훈련소", 110, 7, "char\\barrackj.spr"],
      [63, "일본 망루", 219, 7, "char\\towerj.spr"],
    ],
  );
  assert.deepEqual(
    report.source.sprites.map(({ sourcePath, width, height, frameCount }) => [sourcePath, width, height, frameCount]),
    [
      ["char\\millk.spr", 114, 107, 16], ["char\\hqk.spr", 131, 131, 20], ["char\\advbarrackk.spr", 137, 118, 14],
      ["char\\jhq.spr", 120, 133, 24], ["char\\barrackj.spr", 125, 110, 24], ["char\\towerj.spr", 71, 98, 40],
    ],
  );
  assert.match(report.unresolvedScope, /Construction, damaged, overlay/);
});

test("rejects tampered expected binding, catalog, map, and sprite inputs", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-opening-building-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));
  let artifactIndex = 0;
  const copyJson = (source, mutate) => {
    const path = join(temporaryDirectory, `artifact-${artifactIndex}.json`);
    artifactIndex += 1;
    const value = JSON.parse(readFileSync(source, "utf8"));
    mutate(value);
    writeFileSync(path, `${JSON.stringify(value)}\n`);
    return path;
  };
  const tamperedBindings = K01_PROVEN_OPENING_BUILDING_BINDINGS.map((binding) =>
    binding.internalClass === 63 ? { ...binding, baseFrame: 8 } : binding,
  );
  assert.throws(() => extractK01OpeningBuildingBindings({ bindings: tamperedBindings }), /static-proven K01 opening building bindings/);
  const catalog = copyJson(paths.catalog, (value) => {
    value.types.find(({ internalClass }) => internalClass === 60).sprite.slot = 111;
  });
  assert.throws(() => extractK01OpeningBuildingBindings({ catalog }), /entity type catalog SHA-256/);
  const map = join(temporaryDirectory, "k01.map");
  copyFileSync(paths.map, map);
  const mapBytes = readFileSync(map);
  mapBytes[10] ^= 1;
  writeFileSync(map, mapBytes);
  assert.throws(() => extractK01OpeningBuildingBindings({ map }), /K01 map SHA-256/);
  const copiedSprites = ["millk.spr", "hqk.spr", "advbarrackk.spr", "jhq.spr", "barrackj.spr", "towerj.spr"];
  for (const name of copiedSprites) {
    copyFileSync(join(paths.spriteDirectory, name), join(temporaryDirectory, name));
  }
  const towerBytes = readFileSync(join(temporaryDirectory, "towerj.spr"));
  towerBytes[towerBytes.length - 1] ^= 0xff;
  writeFileSync(join(temporaryDirectory, "towerj.spr"), towerBytes);
  assert.throws(() => extractK01OpeningBuildingBindings({ spriteDirectory: temporaryDirectory }), /towerj\.spr SHA-256/);
});
