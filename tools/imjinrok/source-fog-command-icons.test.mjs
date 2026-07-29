import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { NORMAL_FOG_SOURCES, extractSourceFogCommandIcons } from "./extract-source-fog-command-icons.mjs";

test("exports the hash-bound command frames and normal fog frame zero deterministically", () => {
  const fixture = JSON.parse(readFileSync(resolve("analysis/fixtures/source-fog-command-icons-vectors.json"), "utf8"));
  const first = mkdtempSync(join(tmpdir(), "imjinrok-source-assets-a-"));
  const second = mkdtempSync(join(tmpdir(), "imjinrok-source-assets-b-"));
  const one = extractSourceFogCommandIcons({ outputRoot: first });
  const two = extractSourceFogCommandIcons({ outputRoot: second });
  assert.deepEqual(one.button.header, fixture.button.header);
  assert.deepEqual(one.button.frames.map(({ index }) => index), fixture.button.exportedFrames);
  assert.deepEqual(
    Object.fromEntries(one.button.frames.map(({ index, sha256 }) => [index, sha256])),
    fixture.button.exportedPngSha256,
  );
  assert.equal(one.normalFog.length, fixture.normalFog.sourceCount);
  assert.deepEqual(one.normalFog.map(({ index, header, frames }) => [index, header, frames.map(({ index: frame }) => frame)]), NORMAL_FOG_SOURCES.map(({ index, header }) => [index, header, [0]]));
  assert.deepEqual(one, two);
  assert.deepEqual(
    one.normalFog.map(({ frames }) => frames[0].sha256),
    two.normalFog.map(({ frames }) => frames[0].sha256),
  );
  assert.equal(readFileSync(join(first, "source-fog-command-icons.manifest.json"), "utf8").includes("extract-source-fog-command-icons.mjs"), true);
});
