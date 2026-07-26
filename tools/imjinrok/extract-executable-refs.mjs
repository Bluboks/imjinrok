#!/usr/bin/env node
import { readPeImage, toHex } from "./pe-image.mjs";

const DEFAULT_EXECUTABLE_PATH = "original/imjinrok2/imjinrok2.exe";
const ASCII_MIN_LENGTH = 4;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const report = extractExecutableReferences(args.input ?? DEFAULT_EXECUTABLE_PATH);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
}

export function extractExecutableReferences(executablePath = DEFAULT_EXECUTABLE_PATH) {
  const { buffer, image } = readPeImage(executablePath);
  const strings = extractAsciiStrings(buffer, image);
  const references = strings
    .map((entry) => ({
      ...entry,
      categories: categorizeString(entry.value, entry.section),
    }))
    .filter((entry) => entry.categories.length > 0);
  const xrefsByTargetVa = findImmediateXrefsByTargetVa(
    buffer,
    image,
    references.map((reference) => Number.parseInt(reference.va, 16)),
  );
  const referencesWithXrefs = references.map((reference) => ({
    ...reference,
    xrefs: xrefsByTargetVa.get(reference.va) ?? [],
  }));

  return {
    executablePath,
    imageBase: toHex(image.imageBase),
    referenceCount: referencesWithXrefs.length,
    references: referencesWithXrefs,
    campaign: {
      scriptRefs: getValuesByCategory(referencesWithXrefs, "campaign-script"),
      stageMapRefs: getValuesByCategory(referencesWithXrefs, "stage-map"),
      k01K02Refs: getValuesByCategory(referencesWithXrefs, "k01-k02-mvp"),
    },
    ui: {
      spriteRefs: getValuesByCategory(referencesWithXrefs, "ui-sprite"),
      controlIds: getValuesByCategory(referencesWithXrefs, "ui-control-id"),
      mapControlIds: getValuesByCategory(referencesWithXrefs, "ui-map-control-id"),
    },
  };
}

function findImmediateXrefsByTargetVa(buffer, image, targetVas) {
  const textSection = image.sections.find((section) => section.name === ".text");
  if (!textSection) {
    return new Map();
  }

  const targets = new Set(targetVas);
  const rawStart = textSection.rawPointer;
  const rawEnd = Math.min(buffer.length, textSection.rawPointer + textSection.rawSize);
  const xrefsByTargetVa = new Map();

  for (let rawOffset = rawStart; rawOffset <= rawEnd - 4; rawOffset += 1) {
    const targetVa = buffer.readUInt32LE(rawOffset);
    if (!targets.has(targetVa)) {
      continue;
    }

    const previousByte = rawOffset > rawStart ? buffer[rawOffset - 1] : undefined;
    const instructionRawOffset = previousByte === 0x68 ? rawOffset - 1 : rawOffset;
    const targetVaHex = toHex(targetVa);
    const xrefs = xrefsByTargetVa.get(targetVaHex) ?? [];

    xrefs.push({
      instructionVa: toHex(image.rawOffsetToVa(instructionRawOffset)),
      instructionRawOffset: toHex(instructionRawOffset),
      immediateVa: toHex(image.rawOffsetToVa(rawOffset)),
      immediateRawOffset: toHex(rawOffset),
      kind: previousByte === 0x68 ? "push-imm32" : "imm32",
    });
    xrefsByTargetVa.set(targetVaHex, xrefs);
  }

  return xrefsByTargetVa;
}

function extractAsciiStrings(buffer, image) {
  const strings = [];

  for (const section of image.sections) {
    const rawStart = section.rawPointer;
    const rawEnd = Math.min(buffer.length, section.rawPointer + section.rawSize);
    let start = undefined;

    for (let offset = rawStart; offset <= rawEnd; offset += 1) {
      const byte = offset < rawEnd ? buffer[offset] : 0;
      const printable = byte >= 0x20 && byte <= 0x7e;

      if (printable) {
        start ??= offset;
        continue;
      }

      if (start !== undefined && offset - start >= ASCII_MIN_LENGTH) {
        strings.push({
          section: section.name,
          rawOffset: toHex(start),
          va: toHex(image.rawOffsetToVa(start)),
          value: buffer.toString("ascii", start, offset),
        });
      }
      start = undefined;
    }
  }

  return strings;
}

function categorizeString(value, section) {
  const normalized = normalizePath(value);
  const categories = [];

  if (/^script\\[kcj]\d{4}$/i.test(value)) {
    categories.push("campaign-script");
  }
  if (/^stagemap\\[kcj]\d{2}\.map$/i.test(value)) {
    categories.push("stage-map");
  }
  if (
    /^script\\k0[12](10|15|20|25|27|30)$/i.test(value) ||
    /^stagemap\\k0[12]\.map$/i.test(value)
  ) {
    categories.push("k01-k02-mvp");
  }
  if (/^(yfnt|ybriefingfnt)\//i.test(normalized)) {
    categories.push("ui-sprite");
  }
  if (section === ".data" && /^Y[A-Z0-9]+(?: \[%[sd]\])?$/.test(value)) {
    categories.push("ui-control-id");
  }
  if (section === ".data" && /^YMAP\d{3}(?: \[%d\](?:\[%d\])?)?$/.test(value)) {
    categories.push("ui-map-control-id");
  }

  return categories;
}

function getValuesByCategory(references, category) {
  return references
    .filter((reference) => reference.categories.includes(category))
    .map(({ section, rawOffset, va, value }) => ({ section, rawOffset, va, value }));
}

function normalizePath(path) {
  return path.replaceAll("\\", "/").toLowerCase();
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--input") {
      parsed.input = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function printReport(report) {
  console.log(`Original executable references: ${report.executablePath}`);
  console.log(`  image base: ${report.imageBase}`);
  console.log(`  categorized references: ${report.referenceCount}`);
  console.log(`  campaign scripts: ${report.campaign.scriptRefs.length}`);
  console.log(`  stage maps: ${report.campaign.stageMapRefs.length}`);
  console.log(`  UI sprites: ${report.ui.spriteRefs.length}`);
  console.log(`  UI control ids: ${report.ui.controlIds.length}`);
}
