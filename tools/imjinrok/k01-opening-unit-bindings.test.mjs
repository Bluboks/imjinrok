import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  extractK01OpeningUnitBindings,
  K01_PROVEN_OPENING_UNIT_BINDINGS,
} from "./extract-k01-opening-unit-bindings.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const catalogPath = resolve(
  repositoryRoot,
  "analysis/generated/entity-type-catalog.json",
);

test("recovers all six K01 class-12/13 opening records and their proven project kinds", () => {
  const report = extractK01OpeningUnitBindings();

  assert.equal(report.evidenceStatus, "exact-static-identity-source");
  assert.deepEqual(report.identities, [
    { internalClass: 7, originalGameplayName: "조선 농부", sourcePathNormalized: "char/farmerk.spr", projectKind: "villager" },
    { internalClass: 12, originalGameplayName: "일본 조총병", sourcePathNormalized: "char/gunj1.spr", projectKind: "japanese-gunner" },
    { internalClass: 13, originalGameplayName: "일본 사무라이", sourcePathNormalized: "char/horseswordj1.spr", projectKind: "japanese-samurai" },
  ]);
  assert.deepEqual(report.bindings, K01_PROVEN_OPENING_UNIT_BINDINGS);
  assert.deepEqual(report.supplementalExactIdentityBindings, [
    { originalClass: 7, rawOwnerWord: 0, sourcePosition: { x: 7, y: 6 }, projectKind: "villager", identityMapping: "exact-static-identity-source" },
    { originalClass: 7, rawOwnerWord: 0, sourcePosition: { x: 8, y: 6 }, projectKind: "villager", identityMapping: "exact-static-identity-source" },
  ]);
});

test("rejects a tampered K01 opening class binding", () => {
  const tamperedBindings = K01_PROVEN_OPENING_UNIT_BINDINGS.map((binding) =>
    binding.originalClass === 13
      ? { ...binding, projectKind: "japanese-gunner" }
      : binding,
  );

  assert.throws(
    () => extractK01OpeningUnitBindings({ bindings: tamperedBindings }),
    /static-proven K01 class-12\/13 bindings/,
  );
});

test("rejects stale canonical entity identity evidence", (t) => {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "k01-opening-unit-bindings-"));
  t.after(() => rmSync(temporaryDirectory, { recursive: true, force: true }));

  const staleCatalogPath = join(temporaryDirectory, "entity-type-catalog.json");
  const staleCatalog = readFileSync(catalogPath);
  staleCatalog[staleCatalog.length - 2] ^= 1;
  writeFileSync(staleCatalogPath, staleCatalog);

  assert.throws(
    () => extractK01OpeningUnitBindings({ catalog: staleCatalogPath }),
    /entity type catalog SHA-256/,
  );
});
