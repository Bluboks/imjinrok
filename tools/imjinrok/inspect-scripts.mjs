#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const DEFAULT_ROOT = "original/imjinrok2/script";
const DEFAULT_ENCODING = "euc-kr";
const COMMANDS = new Set([
  "CHANGEMUSIC",
  "CHANGETITLE",
  "NARATION",
  "NOEND",
  "OBJECTIVE",
  "PLAYSOUND",
  "PROCESSMODE",
  "SETDELAYTIME",
  "SHOWMODE",
  "SPEECH",
  "TITLE",
]);
const COMMAND_ARG_COUNTS = {
  CHANGEMUSIC: 1,
  CHANGETITLE: 1,
  NARATION: 1,
  NOEND: 0,
  PLAYSOUND: 1,
  PROCESSMODE: 1,
  SETDELAYTIME: 1,
  SHOWMODE: 1,
  SPEECH: 4,
  TITLE: 1,
};
const ASSET_REF_PATTERN = /[A-Za-z0-9_./\\:-]+\.(spr|yav|map|mpeg|pal|pcx|bmp|dat)/gi;

const args = parseArgs(process.argv.slice(2));
const root = args.root ?? DEFAULT_ROOT;
const files = args.file ? [args.file] : listFiles(root);
const encoding = args.encoding ?? DEFAULT_ENCODING;
const scripts = files.map((file) => inspectScript(file, root, encoding));
const report = summarizeScripts(scripts, root, encoding);

if (args.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printHumanReport(report);
}

function parseArgs(argv) {
  const parsed = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--") {
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--root" || arg === "--file" || arg === "--encoding") {
      parsed[arg.slice(2)] = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function listFiles(rootPath) {
  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(rootPath, entry.name))
    .sort();
}

function inspectScript(file, rootPath, encoding) {
  const buffer = readFileSync(file);
  const text = decodeScriptText(buffer, encoding);
  const lines = text.split(/\r?\n/);
  const commands = [];
  const assetRefs = new Set();
  const metadata = extractMetadata(lines);

  for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
    const line = lines[lineNumber];
    const tokens = [...line.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1]);
    const parsedCommands = parseCommands(tokens);

    for (const command of parsedCommands) {
      commands.push({ line: lineNumber + 1, ...command });
    }

    for (const match of line.matchAll(ASSET_REF_PATTERN)) {
      assetRefs.add(normalizePath(match[0].toLowerCase()));
    }
  }

  return {
    path: normalizePath(relative(rootPath, file)),
    size: statSync(file).size,
    encoding,
    metadata,
    commands,
    assetRefs: [...assetRefs].sort(),
  };
}

function decodeScriptText(buffer, encoding) {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch (error) {
    throw new Error(`Unable to decode mission script with '${encoding}': ${error.message}`);
  }
}

function extractMetadata(lines) {
  const metadata = {};

  for (const line of lines) {
    if (line.includes("[")) {
      break;
    }

    const match = line.match(/^\s*([^:\r\n]+?)\s*:\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function parseCommands(tokens) {
  const commands = [];
  let index = 0;

  while (index < tokens.length) {
    const command = tokens[index].toUpperCase();

    if (!COMMANDS.has(command)) {
      index += 1;
      continue;
    }

    const fixedArgCount = COMMAND_ARG_COUNTS[command];
    let args;

    if (fixedArgCount === undefined) {
      args = [];
      index += 1;
      while (index < tokens.length && !COMMANDS.has(tokens[index].toUpperCase())) {
        args.push(tokens[index]);
        index += 1;
      }
    } else {
      args = tokens.slice(index + 1, index + 1 + fixedArgCount);
      index += 1 + fixedArgCount;
    }

    commands.push({ command, args });
  }

  return commands;
}

function summarizeScripts(scripts, rootPath, encoding) {
  const byCommand = {};
  const assetRefs = new Set();

  for (const script of scripts) {
    for (const command of script.commands) {
      byCommand[command.command] = (byCommand[command.command] ?? 0) + 1;
    }

    for (const ref of script.assetRefs) {
      assetRefs.add(ref);
    }
  }

  return {
    root: rootPath,
    encoding,
    files: scripts.length,
    commands: scripts.reduce((sum, script) => sum + script.commands.length, 0),
    byCommand: Object.fromEntries(Object.entries(byCommand).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    assetRefs: [...assetRefs].sort(),
    scripts,
  };
}

function printHumanReport(report) {
  console.log(`IMJINROK mission script inspection: ${report.root}`);
  console.log(`Files: ${report.files}`);
  console.log(`Commands: ${report.commands}`);
  console.log("");

  console.log("By command:");
  for (const [command, count] of Object.entries(report.byCommand)) {
    console.log(`  ${command}: ${count}`);
  }
  console.log("");

  console.log(`Asset refs: ${report.assetRefs.length}`);
  for (const ref of report.assetRefs.slice(0, 20)) {
    console.log(`  - ${ref}`);
  }
}

function normalizePath(path) {
  return path.split(sep).join("/").replaceAll("\\", "/");
}
