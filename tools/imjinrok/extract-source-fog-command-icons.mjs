#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  decodeSpriteFrame,
  encodeRgbaPng,
  indexedToRgba,
  parseSpriteLikeHeader,
  readPalette,
} from "./codec.mjs";

export const BUTTON_SOURCE = Object.freeze({
  path: "original/imjinrok2/fnt/button.spr",
  sha256: "cfe7bab02f2cb8a1f97a3161075e617ace22d6ecf5a976546263a7c67e4efbb4",
  header: { width: 34, height: 34, frameCount: 289 },
  frames: [4, 6, 10, 11, 12, 16, 26, 27, 28, 29, 39, 43, 45],
});

export const NORMAL_FOG_SOURCES = Object.freeze(Array.from({ length: 15 }, (_, index) => ({
  index,
  path: `original/imjinrok2/tile/normal/fog${index}.spr`,
  sha256: [
    "98c4f138a47503e112b7fd78fd13c0cc6cb9593ef37c18209cbf88bc7f4e4759",
    "0e64374263ceedb1253d7a55fc96681d3e2787e876021134747521bf88bf5701",
    "114fa8aab39b45423a3fe6b3574a194fbc056877ee02f3c2b32b10c8d867b1a0",
    "c5db36d2e772d2309d086911e96eba91b2052d221e8d67b3e7d7ddaeb1009065",
    "c08dd146b67fe85d17900471273c7b6d3feaa06080d8fe83dda5b74b63892e79",
    "26ea4a1ed4a0865ace99e22639df0d513a508da54f73b956c60e2dc9d3a646ca",
    "5670c1940397a807e10ffe132d472613508800671f1aa3da3e1f54b46133c5a0",
    "798f6d69678c7b9c40decbc220199219c9e17cfc6ae76470daebd49d0af99b55",
    "4064773e38a13f43ede3f06975c61bb3405337eb6fcb90ccc3d7b4425eaf5f59",
    "22ba6fc52a03bbed16f063dcd16fdf47437bdab642ecbcb58af2c0aff03676be",
    "bf6b260f412305fd29b0a6a8454fb6bb112e0344ac2f96b465f6f62923437c7c",
    "3633f57e785791c0f5e9e6f632fed1575b23fbf7756177be2162dbd6ce602e47",
    "3ed4ced064f3998f143a344f0f17cac528d91953fd41a97deb3add1b7330ba5d",
    "b363feaf9cd89b964a7d306f0638f2f41cc57bf8b8efd0e1d8dd818c9aee5ee7",
    "efb2eb836d4552a9bea57a37f97370cb2de1e1a55d4f34271889ad0a083fc669",
  ][index],
  header: { width: 32, height: 16, frameCount: 96 },
  frames: [0],
})));

export function extractSourceFogCommandIcons({
  outputRoot = "apps/game-client/public/assets/themes/default",
  palettePath = "original/imjinrok2/pal/imjin2.pal",
} = {}) {
  const palette = readPalette(readFileSync(palettePath), palettePath);
  const button = exportSprite(BUTTON_SOURCE, join(outputRoot, "ui/command-icons"), palette, outputRoot);
  const fog = NORMAL_FOG_SOURCES.map((source) => exportSprite(source, join(outputRoot, "fog/normal"), palette, outputRoot));
  const manifest = {
    generatedBy: "tools/imjinrok/extract-source-fog-command-icons.mjs",
    palette: { path: palettePath, sha256: sha256(readFileSync(palettePath)) },
    button,
    normalFog: fog,
  };
  writeFileSync(join(outputRoot, "source-fog-command-icons.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function exportSprite(source, outputDirectory, palette, outputRoot) {
  const input = readFileSync(source.path);
  assertEqual(sha256(input), source.sha256, `${source.path} SHA-256`);
  const header = parseSpriteLikeHeader(input, source.path);
  assertEqual(JSON.stringify(pickHeader(header)), JSON.stringify(source.header), `${source.path} header`);
  mkdirSync(outputDirectory, { recursive: true });
  const frames = source.frames.map((frameIndex) => {
    const indexed = decodeSpriteFrame(input, header, frameIndex);
    const png = encodeRgbaPng(header.width, header.height, indexedToRgba(indexed, palette));
    const prefix = source.path.includes("/fog") ? `fog${source.index}` : "button";
    const fileName = `${prefix}_${String(frameIndex).padStart(4, "0")}.png`;
    writeFileSync(join(outputDirectory, fileName), png);
    return { index: frameIndex, path: relative(outputRoot, join(outputDirectory, fileName)).replaceAll("\\", "/"), sha256: sha256(png) };
  });
  return { ...source, frames };
}

function pickHeader(header) {
  return { width: header.width, height: header.height, frameCount: header.frameCount };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(extractSourceFogCommandIcons(), null, 2));
}
