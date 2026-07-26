import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const DEFAULT_SOURCE_ROOT = "original/imjinrok2";
const DEFAULT_OUTPUT_ROOT = "apps/game-client/public/assets/audio";

const KOREAN_MVP_CAMPAIGN_VOICE_IDS = [
  "k01010",
  "k01020",
  "k01030",
  "k01040",
  "k01050",
  "k01060",
  "k01070",
  "k01080",
  "k01090",
  "k01100",
  "k01110",
  "k01112",
  "k01114",
  "k01116",
  "k01120",
  "k01130",
  "k01140",
  "k02010",
  "k02020",
  "k02030",
  "k02040",
  "k02050",
  "k02060",
  "k02070",
  "k02080",
  "k02090",
  "k02100",
  "k02110",
  "k02120",
  "k02130",
  "k02140",
  "k02150",
  "k02160",
  "k02170",
  "k02180",
  "k02190",
  "k02200",
  "k02210",
  "k02220",
  "k02230",
  "k02260",
];

const DEFAULT_CUES = [
  ...KOREAN_MVP_CAMPAIGN_VOICE_IDS.map((voiceId) => [
    `script/eft/${voiceId.toUpperCase()}.YAV`,
    `mission/${voiceId.toLowerCase()}.wav`,
  ]),
  ["tempeft/select_farmerk1.YAV", "voice/select_farmerk1.wav"],
  ["tempeft/move_farmerk1.YAV", "voice/move_farmerk1.wav"],
  ["tempeft/attack_farmerk1.YAV", "voice/attack_farmerk1.wav"],
  ["tempeft/die_farmerk1.YAV", "voice/die_farmerk1.wav"],
  ["tempeft/select_swordk1.YAV", "voice/select_swordk1.wav"],
  ["tempeft/move_swordk1.YAV", "voice/move_swordk1.wav"],
  ["tempeft/attack_swordk1.YAV", "voice/attack_swordk1.wav"],
  ["tempeft/die_swordk1.YAV", "voice/die_swordk1.wav"],
  ["tempeft/select_archerk1.YAV", "voice/select_archerk1.wav"],
  ["tempeft/move_archerk1.YAV", "voice/move_archerk1.wav"],
  ["tempeft/attack_archerk1.YAV", "voice/attack_archerk1.wav"],
  ["tempeft/die_archerk1.YAV", "voice/die_archerk1.wav"],
  ["tempeft/select_swordj1.YAV", "voice/select_swordj1.wav"],
  ["tempeft/move_swordj1.YAV", "voice/move_swordj1.wav"],
  ["tempeft/attack_swordj1.YAV", "voice/attack_swordj1.wav"],
  ["tempeft/die_swordj1.YAV", "voice/die_swordj1.wav"],
  ["tempeft/select_gunj1.YAV", "voice/select_gunj1.wav"],
  ["tempeft/move_gunj1.YAV", "voice/move_gunj1.wav"],
  ["tempeft/attack_gunj1.YAV", "voice/attack_gunj1.wav"],
  ["tempeft/die_gunj1.YAV", "voice/die_gunj1.wav"],
  ["tempeft/hqk1.YAV", "voice/hqk1.wav"],
  ["tempeft/millk1.YAV", "voice/millk1.wav"],
  ["tempeft/barrackk1.YAV", "voice/barrackk1.wav"],
  ["tempeft/firehousek1.YAV", "voice/firehousek1.wav"],
  ["tempeft/hqj1.YAV", "voice/hqj1.wav"],
  ["tempeft/select_barrackj.YAV", "voice/select_barrackj.wav"],
  ["tempeft/select_firehousej.YAV", "voice/select_firehousej.wav"],
  ["tempeft/select_generalk42.YAV", "voice/select_generalk42.wav"],
  ["tempeft/move_generalk42.YAV", "voice/move_generalk42.wav"],
  ["eft/general4kattack1.YAV", "voice/attack_generalk4.wav"],
  ["tempeft/cannotmakethere.YAV", "ui/cannotmakethere.wav"],
  ["tempeft/beattackedmessage.YAV", "ui/beattackedmessage.wav"],
  ["tempeft/builddone.YAV", "ui/builddone.wav"],
  ["tempeft/trainspotdonemessage.YAV", "ui/trainspotdonemessage.wav"],
  ["tempeft/upgradedone.YAV", "ui/upgradedone.wav"],
  ["music/briefmusic.YAV", "music/briefmusic.wav"],
  ["music/win.YAV", "music/win.wav"],
  ["music/lose.YAV", "music/lose.wav"],
];

function main() {
  const sourceRoot = process.argv[2] ?? DEFAULT_SOURCE_ROOT;
  const outputRoot = process.argv[3] ?? DEFAULT_OUTPUT_ROOT;

  for (const [sourceRelativePath, outputRelativePath] of DEFAULT_CUES) {
    const sourcePath = join(sourceRoot, sourceRelativePath);
    const outputPath = join(outputRoot, outputRelativePath);
    const wav = convertYavToWav(readFileSync(sourcePath), sourcePath);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, wav);
    console.log(`${sourcePath} -> ${outputPath}`);
  }
}

function convertYavToWav(buffer, source) {
  if (buffer.length < 26) {
    throw new Error(`${source}: YAV file is too small`);
  }

  const fmtSize = buffer.readUInt32LE(0);
  const formatTag = buffer.readUInt16LE(4);
  const channels = buffer.readUInt16LE(6);
  const sampleRate = buffer.readUInt32LE(8);
  const byteRate = buffer.readUInt32LE(12);
  const blockAlign = buffer.readUInt16LE(16);
  const bitsPerSample = buffer.readUInt16LE(18);
  const extraSize = buffer.readUInt16LE(20);
  const dataSizeOffset = 4 + fmtSize;
  const dataOffset = dataSizeOffset + 4;

  if (fmtSize !== 18) {
    throw new Error(`${source}: unsupported YAV fmt size ${fmtSize}`);
  }

  if (formatTag !== 1 || channels < 1 || channels > 2 || (bitsPerSample !== 8 && bitsPerSample !== 16)) {
    throw new Error(`${source}: unsupported PCM format ${formatTag}, channels ${channels}, bits ${bitsPerSample}`);
  }

  if (extraSize !== 0) {
    throw new Error(`${source}: unsupported YAV extra fmt bytes ${extraSize}`);
  }

  if (dataOffset > buffer.length) {
    throw new Error(`${source}: missing sample data`);
  }

  const declaredDataSize = buffer.readUInt32LE(dataSizeOffset);
  const availableDataSize = buffer.length - dataOffset;
  const dataSize = Math.min(declaredDataSize, availableDataSize);

  if (declaredDataSize !== availableDataSize) {
    console.warn(`${source}: declared ${declaredDataSize} bytes, found ${availableDataSize}; using ${dataSize}`);
  }

  const sampleData = buffer.subarray(dataOffset, dataOffset + dataSize);
  const wavHeader = createWavHeader({
    bitsPerSample,
    blockAlign,
    byteRate,
    channels,
    dataSize,
    sampleRate,
  });

  return Buffer.concat([wavHeader, sampleData]);
}

function createWavHeader({ bitsPerSample, blockAlign, byteRate, channels, dataSize, sampleRate }) {
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);

  return header;
}

main();
