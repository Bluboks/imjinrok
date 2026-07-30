import assert from "node:assert/strict";
import test from "node:test";
import { runRenderTextureBatch, type RenderTextureBatchTarget } from "./renderTextureBatch.js";

class BatchTarget implements RenderTextureBatchTarget {
  readonly calls: string[] = [];

  beginDraw(): void {
    this.calls.push("begin");
  }

  endDraw(): void {
    this.calls.push("end");
  }
}

test("render texture batch closes after normal drawing", () => {
  const target = new BatchTarget();

  runRenderTextureBatch(target, () => target.calls.push("draw"));

  assert.deepEqual(target.calls, ["begin", "draw", "end"]);
});

test("render texture batch closes when a draw helper fails", () => {
  const target = new BatchTarget();

  assert.throws(() => runRenderTextureBatch(target, () => {
    target.calls.push("draw");
    throw new Error("missing texture");
  }), /missing texture/u);
  assert.deepEqual(target.calls, ["begin", "draw", "end"]);
});
