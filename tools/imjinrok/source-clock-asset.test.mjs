import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { extractSourceClockAsset } from "./extract-source-clock-asset.mjs";

const fixturePath = "analysis/fixtures/source-clock-asset.json";

test("hash-binds the original clock source identity and sprite container", () => {
  assert.deepEqual(extractSourceClockAsset(), JSON.parse(readFileSync(fixturePath, "utf8")));
});

test("rejects a changed clock sprite instead of retaining a stale identity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "source-clock-"));
  try {
    const spritePath = join(directory, "clock.spr");
    const changed = Buffer.from(readFileSync("original/imjinrok2/fnt/clock.spr"));
    changed[0x0c] ^= 1;
    writeFileSync(spritePath, changed);

    assert.throws(() => extractSourceClockAsset({ clockSpritePath: spritePath }), /SHA-256/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
