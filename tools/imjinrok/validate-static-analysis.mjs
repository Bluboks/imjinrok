#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_IMJINROK_EXE_SHA256 =
  "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e";
export const STATIC_ANALYSIS_SCHEMA_VERSION = 2;

const defaultAnalysisDirectory = resolve(
  fileURLToPath(new URL("../../analysis/generated/imjinrok2", import.meta.url)),
);

if (import.meta.url === `file://${process.argv[1]}`) {
  const analysisDirectory = parseInputArgument(process.argv.slice(2)) ?? defaultAnalysisDirectory;
  const summary = validateStaticAnalysisDirectory(analysisDirectory);
  console.log(JSON.stringify(summary, null, 2));
}

export function validateStaticAnalysisDirectory(analysisDirectory) {
  const resolvedDirectory = resolve(analysisDirectory);
  const manifest = readJson(resolvedDirectory, "manifest.json");
  const functionsDocument = readJson(resolvedDirectory, "functions.json");
  const stringsDocument = readJson(resolvedDirectory, "strings.json");
  const referencesDocument = readJson(resolvedDirectory, "references.json");
  const jumpTablesDocument = readJson(resolvedDirectory, "jump-tables.json");
  const seedsDocument = readJson(resolvedDirectory, "seeds.json");

  validateDocumentHeader("manifest.json", manifest);
  assertEqual(
    manifest.sourceSha256,
    EXPECTED_IMJINROK_EXE_SHA256,
    "manifest.json sourceSha256",
  );
  assertEqual(
    manifest.sourceSize,
    843833,
    "manifest.json sourceSize",
  );
  assertEqual(
    manifest.imageBase,
    "0x00400000",
    "manifest.json imageBase",
  );
  assertNonEmptyString(manifest.ghidraVersion, "manifest.json ghidraVersion");
  assertNonEmptyArray(manifest.memoryBlocks, "manifest.json memoryBlocks");

  validateDocumentHeader("functions.json", functionsDocument);
  validateDocumentHeader("strings.json", stringsDocument);
  validateDocumentHeader("references.json", referencesDocument);
  validateDocumentHeader("jump-tables.json", jumpTablesDocument);
  validateDocumentHeader("seeds.json", seedsDocument);

  const functions = requireArray(functionsDocument.functions, "functions.json functions");
  const strings = requireArray(stringsDocument.strings, "strings.json strings");
  const references = requireArray(
    referencesDocument.references,
    "references.json references",
  );
  const computedJumps = requireArray(
    jumpTablesDocument.candidates,
    "jump-tables.json candidates",
  );
  const jumpTables = requireArray(
    jumpTablesDocument.tables,
    "jump-tables.json tables",
  );
  const seeds = requireArray(seedsDocument.seeds, "seeds.json seeds");
  const seedFunctions = requireArray(seedsDocument.functions, "seeds.json functions");

  assertEqual(manifest.functionCount, functions.length, "manifest functionCount");
  assertEqual(manifest.stringCount, strings.length, "manifest stringCount");
  assertEqual(manifest.referenceCount, references.length, "manifest referenceCount");
  assertEqual(
    manifest.computedJumpCount,
    computedJumps.length,
    "manifest computedJumpCount",
  );
  assertEqual(manifest.jumpTableCount, jumpTables.length, "manifest jumpTableCount");
  assertEqual(manifest.seedCount, seeds.length, "manifest seedCount");
  assertEqual(manifest.seedFunctionCount, seedFunctions.length, "manifest seedFunctionCount");

  validateFunctions(functions);
  validateStrings(strings);
  const functionEntries = new Set(functions.map((functionRecord) => functionRecord.entry));
  validateReferences(references, functionEntries);
  validateJumpTables(computedJumps, jumpTables, functionEntries);
  validateSeeds(seeds, seedFunctions);
  validateChecksums(resolvedDirectory);

  return {
    analysisDirectory: resolvedDirectory,
    sourceSha256: manifest.sourceSha256,
    ghidraVersion: manifest.ghidraVersion,
    functionCount: functions.length,
    stringCount: strings.length,
    referenceCount: references.length,
    computedJumpCount: computedJumps.length,
    jumpTableCount: jumpTables.length,
    seedCount: seeds.length,
    seedFunctionCount: seedFunctions.length,
  };
}

function validateChecksums(directory) {
  const expectedFileNames = [
    "manifest.json",
    "functions.json",
    "strings.json",
    "references.json",
    "jump-tables.json",
    "seeds.json",
  ];
  const checksumPath = resolve(directory, "SHA256SUMS");
  const checksumLines = readText(checksumPath)
    .trim()
    .split("\n");

  assertEqual(
    checksumLines.length,
    expectedFileNames.length,
    "SHA256SUMS entry count",
  );

  for (const [index, fileName] of expectedFileNames.entries()) {
    const line = checksumLines[index];
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line);
    if (match === null) {
      throw new Error(`Invalid SHA256SUMS entry: ${line}`);
    }

    const [, expectedChecksum, recordedFileName] = match;
    assertEqual(recordedFileName, fileName, `SHA256SUMS file name at index ${index}`);

    const actualChecksum = createHash("sha256")
      .update(readFileSync(resolve(directory, fileName)))
      .digest("hex");
    assertEqual(actualChecksum, expectedChecksum, `SHA256SUMS checksum for ${fileName}`);
  }
}

function validateDocumentHeader(fileName, document) {
  assertEqual(
    document.schemaVersion,
    STATIC_ANALYSIS_SCHEMA_VERSION,
    `${fileName} schemaVersion`,
  );
  if (fileName !== "manifest.json") {
    assertEqual(
      document.sourceSha256,
      EXPECTED_IMJINROK_EXE_SHA256,
      `${fileName} sourceSha256`,
    );
  }
}

function validateFunctions(functions) {
  assertNonEmptyArray(functions, "functions.json functions");
  let previousEntry;
  const entries = new Set();

  for (const [index, functionRecord] of functions.entries()) {
    const context = `functions.json functions[${index}]`;
    assertAddress(functionRecord.entry, `${context}.entry`);
    assertNonEmptyString(functionRecord.name, `${context}.name`);
    assertNonEmptyString(functionRecord.prototype, `${context}.prototype`);
    assertNonNegativeInteger(functionRecord.bodySize, `${context}.bodySize`);
    assertNonNegativeInteger(functionRecord.instructionCount, `${context}.instructionCount`);
    assertMatch(
      functionRecord.instructionSha256,
      /^[0-9a-f]{64}$/,
      `${context}.instructionSha256`,
    );
    assertSortedStrings(functionRecord.bodyRanges, `${context}.bodyRanges`);
    assertSortedStrings(functionRecord.callers, `${context}.callers`);
    assertSortedStrings(functionRecord.callees, `${context}.callees`);

    if (entries.has(functionRecord.entry)) {
      throw new Error(`Duplicate function entry: ${functionRecord.entry}`);
    }
    if (previousEntry !== undefined && previousEntry >= functionRecord.entry) {
      throw new Error(
        `Function entries are not strictly sorted: ${previousEntry}, ${functionRecord.entry}`,
      );
    }
    entries.add(functionRecord.entry);
    previousEntry = functionRecord.entry;
  }
}

function validateStrings(strings) {
  let previousAddress;

  for (const [index, stringRecord] of strings.entries()) {
    const context = `strings.json strings[${index}]`;
    assertAddress(stringRecord.address, `${context}.address`);
    assertNonNegativeInteger(stringRecord.length, `${context}.length`);
    assertNonEmptyString(stringRecord.dataType, `${context}.dataType`);
    if (typeof stringRecord.value !== "string") {
      throw new TypeError(`${context}.value must be a string`);
    }
    assertSortedStrings(stringRecord.references, `${context}.references`);

    if (previousAddress !== undefined && previousAddress >= stringRecord.address) {
      throw new Error(
        `String addresses are not strictly sorted: ${previousAddress}, ${stringRecord.address}`,
      );
    }
    previousAddress = stringRecord.address;
  }
}

function validateReferences(references, functionEntries) {
  assertNonEmptyArray(references, "references.json references");
  let previous;

  for (const [index, reference] of references.entries()) {
    const context = `references.json references[${index}]`;
    assertAddress(reference.from, `${context}.from`);
    assertAddress(reference.to, `${context}.to`);
    assertNonEmptyString(reference.type, `${context}.type`);
    assertNonEmptyString(reference.source, `${context}.source`);
    assertInteger(reference.operandIndex, `${context}.operandIndex`);
    assertBoolean(reference.primary, `${context}.primary`);
    if (reference.fromFunctionEntry !== null) {
      assertAddress(reference.fromFunctionEntry, `${context}.fromFunctionEntry`);
      if (!functionEntries.has(reference.fromFunctionEntry)) {
        throw new Error(
          `${context}.fromFunctionEntry is absent from functions.json: ` +
          reference.fromFunctionEntry,
        );
      }
    }
    assertString(reference.fromBlock, `${context}.fromBlock`);
    assertString(reference.toBlock, `${context}.toBlock`);
    assertString(reference.toSymbol, `${context}.toSymbol`);

    if (previous !== undefined && compareReferences(previous, reference) > 0) {
      throw new Error(
        `References are not sorted: ${formatReference(previous)}, ` +
        formatReference(reference),
      );
    }
    previous = reference;
  }
}

function validateJumpTables(candidates, tables, functionEntries) {
  assertNonEmptyArray(candidates, "jump-tables.json candidates");
  let previousCandidateAddress;
  const candidatesByAddress = new Map();

  for (const [index, candidate] of candidates.entries()) {
    const context = `jump-tables.json candidates[${index}]`;
    assertAddress(candidate.address, `${context}.address`);
    if (candidate.functionEntry !== null) {
      assertAddress(candidate.functionEntry, `${context}.functionEntry`);
      if (!functionEntries.has(candidate.functionEntry)) {
        throw new Error(
          `${context}.functionEntry is absent from functions.json: ` +
          candidate.functionEntry,
        );
      }
    }
    assertNonEmptyString(candidate.instruction, `${context}.instruction`);
    assertSortedStrings(candidate.destinations, `${context}.destinations`);
    assertBoolean(candidate.recovered, `${context}.recovered`);

    if (
      previousCandidateAddress !== undefined &&
      previousCandidateAddress >= candidate.address
    ) {
      throw new Error(
        `Computed jump addresses are not strictly sorted: ` +
        `${previousCandidateAddress}, ${candidate.address}`,
      );
    }
    candidatesByAddress.set(candidate.address, candidate);
    previousCandidateAddress = candidate.address;
  }

  let previousTable;
  const recoveredAddresses = new Set();
  for (const [index, table] of tables.entries()) {
    const context = `jump-tables.json tables[${index}]`;
    assertAddress(table.functionEntry, `${context}.functionEntry`);
    if (!functionEntries.has(table.functionEntry)) {
      throw new Error(
        `${context}.functionEntry is absent from functions.json: ${table.functionEntry}`,
      );
    }
    assertAddress(table.switchAddress, `${context}.switchAddress`);
    const candidate = candidatesByAddress.get(table.switchAddress);
    if (candidate === undefined) {
      throw new Error(
        `${context}.switchAddress has no computed-jump candidate: ${table.switchAddress}`,
      );
    }
    if (recoveredAddresses.has(table.switchAddress)) {
      throw new Error(`Duplicate recovered jump table: ${table.switchAddress}`);
    }

    const cases = requireArray(table.cases, `${context}.cases`);
    assertNonEmptyArray(cases, `${context}.cases`);
    for (const [caseIndex, caseRecord] of cases.entries()) {
      const caseContext = `${context}.cases[${caseIndex}]`;
      assertAddress(caseRecord.destination, `${caseContext}.destination`);
      if (caseRecord.label !== null) {
        assertInteger(caseRecord.label, `${caseContext}.label`);
      }
    }

    const loadTables = requireArray(table.loadTables, `${context}.loadTables`);
    let previousLoadTableAddress;
    for (const [loadIndex, loadTable] of loadTables.entries()) {
      const loadContext = `${context}.loadTables[${loadIndex}]`;
      assertAddress(loadTable.address, `${loadContext}.address`);
      assertNonNegativeInteger(loadTable.entrySize, `${loadContext}.entrySize`);
      assertNonNegativeInteger(loadTable.entryCount, `${loadContext}.entryCount`);
      if (
        previousLoadTableAddress !== undefined &&
        previousLoadTableAddress > loadTable.address
      ) {
        throw new Error(
          `${context}.loadTables must be sorted: ` +
          `${previousLoadTableAddress}, ${loadTable.address}`,
        );
      }
      previousLoadTableAddress = loadTable.address;
    }

    if (previousTable !== undefined && compareJumpTables(previousTable, table) > 0) {
      throw new Error(
        `Jump tables are not sorted: ${formatJumpTable(previousTable)}, ` +
        formatJumpTable(table),
      );
    }
    recoveredAddresses.add(table.switchAddress);
    previousTable = table;
  }

  for (const [index, candidate] of candidates.entries()) {
    assertEqual(
      candidate.recovered,
      recoveredAddresses.has(candidate.address),
      `jump-tables.json candidates[${index}].recovered`,
    );
  }
}

function validateSeeds(seeds, seedFunctions) {
  assertNonEmptyArray(seeds, "seeds.json seeds");
  assertNonEmptyArray(seedFunctions, "seeds.json functions");

  const functionEntries = new Set(seedFunctions.map((functionRecord) => functionRecord.entry));
  const labels = new Set();
  let previousFunctionEntry;

  for (const [index, seed] of seeds.entries()) {
    const context = `seeds.json seeds[${index}]`;
    assertNonEmptyString(seed.label, `${context}.label`);
    assertAddress(seed.address, `${context}.address`);
    assertAddress(seed.functionEntry, `${context}.functionEntry`);
    if (labels.has(seed.label)) {
      throw new Error(`Duplicate seed label: ${seed.label}`);
    }
    if (!functionEntries.has(seed.functionEntry)) {
      throw new Error(
        `${context}.functionEntry does not have exported function details: ${seed.functionEntry}`,
      );
    }
    labels.add(seed.label);
  }

  for (const [index, functionRecord] of seedFunctions.entries()) {
    const context = `seeds.json functions[${index}]`;
    assertAddress(functionRecord.entry, `${context}.entry`);
    assertNonEmptyString(functionRecord.name, `${context}.name`);
    assertNonEmptyString(functionRecord.prototype, `${context}.prototype`);
    assertSortedStrings(functionRecord.bodyRanges, `${context}.bodyRanges`);
    assertNonEmptyArray(functionRecord.basicBlocks, `${context}.basicBlocks`);
    assertNonEmptyArray(functionRecord.instructions, `${context}.instructions`);
    assertNonEmptyString(functionRecord.decompilation, `${context}.decompilation`);

    if (previousFunctionEntry !== undefined && previousFunctionEntry >= functionRecord.entry) {
      throw new Error(
        `Seed functions are not strictly sorted: ${previousFunctionEntry}, ${functionRecord.entry}`,
      );
    }
    previousFunctionEntry = functionRecord.entry;

    let previousInstructionAddress;
    for (const [instructionIndex, instruction] of functionRecord.instructions.entries()) {
      const instructionContext = `${context}.instructions[${instructionIndex}]`;
      assertAddress(instruction.address, `${instructionContext}.address`);
      assertMatch(
        instruction.bytes,
        /^(?:[0-9a-f]{2})(?: [0-9a-f]{2})*$/,
        `${instructionContext}.bytes`,
      );
      assertNonEmptyString(instruction.flowType, `${instructionContext}.flowType`);
      assertNonEmptyString(instruction.text, `${instructionContext}.text`);
      if (
        previousInstructionAddress !== undefined &&
        previousInstructionAddress >= instruction.address
      ) {
        throw new Error(
          `${context} instruction addresses are not strictly sorted: ` +
          `${previousInstructionAddress}, ${instruction.address}`,
        );
      }
      previousInstructionAddress = instruction.address;
    }
  }
}

function readJson(directory, fileName) {
  const path = resolve(directory, fileName);
  const text = readText(path);

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error.message}`, { cause: error });
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${path}: ${error.message}`, { cause: error });
  }
}

function parseInputArgument(argv) {
  if (argv.length === 0) {
    return undefined;
  }
  if (argv.length !== 2 || argv[0] !== "--input") {
    throw new Error("Usage: validate-static-analysis.mjs [--input <directory>]");
  }
  return argv[1];
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  return value;
}

function assertNonEmptyArray(value, label) {
  const array = requireArray(value, label);
  if (array.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}

function assertSortedStrings(value, label) {
  const array = requireArray(value, label);
  let previous;
  for (const [index, item] of array.entries()) {
    if (typeof item !== "string") {
      throw new TypeError(`${label}[${index}] must be a string`);
    }
    if (previous !== undefined && previous > item) {
      throw new Error(`${label} must be sorted: ${previous}, ${item}`);
    }
    previous = item;
  }
}

function compareReferences(left, right) {
  return (
    compareStrings(left.from, right.from) ||
    left.operandIndex - right.operandIndex ||
    compareStrings(left.to, right.to) ||
    compareStrings(left.type, right.type) ||
    compareStrings(left.source, right.source)
  );
}

function compareJumpTables(left, right) {
  return (
    compareStrings(left.switchAddress, right.switchAddress) ||
    compareStrings(left.functionEntry, right.functionEntry)
  );
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function formatReference(reference) {
  return [
    reference.from,
    reference.operandIndex,
    reference.to,
    reference.type,
    reference.source,
  ].join("|");
}

function formatJumpTable(table) {
  return `${table.switchAddress}|${table.functionEntry}`;
}

function assertAddress(value, label) {
  assertMatch(value, /^0x[0-9a-f]{8,16}$/, label);
}

function assertString(value, label) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) {
    throw new TypeError(`${label} must be an integer`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean`);
  }
}

function assertMatch(value, pattern, label) {
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new TypeError(`${label} does not match ${pattern}: ${String(value)}`);
  }
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
}
