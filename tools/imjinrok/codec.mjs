import { deflateSync } from "node:zlib";

export const SPRITE_MAGIC = Buffer.from([0x09, 0x00, 0x00, 0x00]);
export const OFFSET_TABLE_START = 0x04c0;
export const END_OFFSET_POINTER = 0x0bc8;
export const DATA_BASE = 0x0bf4;
export const TRANSPARENT_INDEX = 0xfe;

const MAX_FRAME_COUNT = 10000;

export function readU32Le(buffer, offset) {
  return buffer.readUInt32LE(offset);
}

export function parseSpriteLikeHeader(buffer, source = "<buffer>") {
  if (buffer.length < DATA_BASE) {
    throw new Error(`${source}: file is too small for an IMJIN sprite header`);
  }

  if (!buffer.subarray(0, 4).equals(SPRITE_MAGIC)) {
    throw new Error(`${source}: magic mismatch`);
  }

  const width = readU32Le(buffer, 0x04);
  const height = readU32Le(buffer, 0x08);
  const frameCount = readU32Le(buffer, 0x0c);

  if (width <= 0 || height <= 0) {
    throw new Error(`${source}: invalid dimensions ${width}x${height}`);
  }

  if (frameCount <= 0 || frameCount > MAX_FRAME_COUNT) {
    throw new Error(`${source}: invalid frame count ${frameCount}`);
  }

  const offsetTableEnd = OFFSET_TABLE_START + frameCount * 4;
  if (offsetTableEnd > END_OFFSET_POINTER) {
    throw new Error(`${source}: frame table is larger than expected header space`);
  }

  const offsets = [];
  for (let i = 0; i < frameCount; i += 1) {
    offsets.push(readU32Le(buffer, OFFSET_TABLE_START + i * 4));
  }

  const endOffset = readU32Le(buffer, END_OFFSET_POINTER);
  const frames = offsets.map((relativeOffset, index) => {
    const nextRelativeOffset = offsets[index + 1] ?? endOffset;
    const size = nextRelativeOffset - relativeOffset;
    const dataOffset = DATA_BASE + relativeOffset;

    if (size <= 0) {
      throw new Error(`${source}: frame ${index} has invalid size ${size}`);
    }

    if (dataOffset < DATA_BASE || dataOffset + size > buffer.length) {
      throw new Error(`${source}: frame ${index} range exceeds file bounds`);
    }

    return { index, relativeOffset, dataOffset, size };
  });

  return {
    width,
    height,
    frameCount,
    endOffset,
    frames,
  };
}

export function decodeRleFe(source, outputLength) {
  const output = Buffer.alloc(outputLength, TRANSPARENT_INDEX);
  let inputOffset = 0;
  let outputOffset = 0;

  while (inputOffset < source.length && outputOffset < outputLength) {
    const value = source[inputOffset];
    inputOffset += 1;

    if (value === TRANSPARENT_INDEX) {
      if (inputOffset >= source.length) {
        break;
      }

      const runLength = source[inputOffset];
      inputOffset += 1;
      output.fill(TRANSPARENT_INDEX, outputOffset, Math.min(outputOffset + runLength, outputLength));
      outputOffset += runLength;
      continue;
    }

    output[outputOffset] = value;
    outputOffset += 1;
  }

  return output;
}

export function decodeYtlIsoRows(source, width, height) {
  const decoders = [
    decodeInterleavedRows8,
    decodeSeparatedRows8,
    decodeInterleavedRows16,
    decodeSeparatedRows16,
  ];

  for (const decode of decoders) {
    const output = decode(source, width, height);
    if (output) {
      return output;
    }
  }

  throw new Error(`YTL row stream decode failed for ${width}x${height} frame (${source.length} bytes)`);
}

export function decodeSpriteFrame(buffer, header, frameIndex, options = {}) {
  const frame = header.frames[frameIndex];
  if (!frame) {
    throw new Error(`frame ${frameIndex} is out of range`);
  }

  const source = buffer.subarray(frame.dataOffset, frame.dataOffset + frame.size);

  if (options.layout === "ytl") {
    return decodeYtlIsoRows(source, header.width, header.height);
  }

  return decodeRleFe(source, header.width * header.height);
}

export function readPalette(buffer, source = "<palette>") {
  if (buffer.length < 768) {
    throw new Error(`${source}: palette is smaller than 768 bytes`);
  }

  const palette = buffer.subarray(0, 768);
  const maxChannel = palette.reduce((max, value) => Math.max(max, value), 0);
  const scale = maxChannel <= 63 ? 255 / 63 : 1;
  const output = Buffer.alloc(768);

  for (let i = 0; i < 768; i += 1) {
    output[i] = Math.max(0, Math.min(255, Math.round(palette[i] * scale)));
  }

  return output;
}

export function indexedToRgba(indexedPixels, palette, transparentIndex = TRANSPARENT_INDEX) {
  const rgba = Buffer.alloc(indexedPixels.length * 4);

  for (let i = 0; i < indexedPixels.length; i += 1) {
    const colorIndex = indexedPixels[i];
    const paletteOffset = colorIndex * 3;
    const outputOffset = i * 4;

    rgba[outputOffset] = palette[paletteOffset] ?? 0;
    rgba[outputOffset + 1] = palette[paletteOffset + 1] ?? 0;
    rgba[outputOffset + 2] = palette[paletteOffset + 2] ?? 0;
    rgba[outputOffset + 3] = colorIndex === transparentIndex ? 0 : 255;
  }

  return rgba;
}

export function encodeRgbaPng(width, height, rgba) {
  if (rgba.length !== width * height * 4) {
    throw new Error(`RGBA buffer length ${rgba.length} does not match ${width}x${height}`);
  }

  const scanlineLength = width * 4;
  const raw = Buffer.alloc((scanlineLength + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (scanlineLength + 1);
    const rgbaOffset = y * scanlineLength;
    raw[rawOffset] = 0;
    rgba.copy(raw, rawOffset + 1, rgbaOffset, rgbaOffset + scanlineLength);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createPngChunk("IHDR", createIhdr(width, height)),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodeInterleavedRows8(source, width, height) {
  let offset = 0;
  const output = Buffer.alloc(width * height, TRANSPARENT_INDEX);

  for (let y = 0; y < height; y += 1) {
    if (offset + 2 > source.length) {
      return null;
    }

    const x = source[offset];
    const count = source[offset + 1];
    offset += 2;

    if (x + count > width || offset + count > source.length) {
      return null;
    }

    source.copy(output, y * width + x, offset, offset + count);
    offset += count;
  }

  return offset === source.length ? output : null;
}

function decodeSeparatedRows8(source, width, height) {
  const headerLength = height * 2;
  if (source.length < headerLength) {
    return null;
  }

  let totalPayload = 0;
  const spans = [];

  for (let y = 0; y < height; y += 1) {
    const offset = y * 2;
    const x = source[offset];
    const count = source[offset + 1];

    if (x + count > width) {
      return null;
    }

    totalPayload += count;
    spans.push({ x, count });
  }

  if (headerLength + totalPayload > source.length) {
    return null;
  }

  const output = Buffer.alloc(width * height, TRANSPARENT_INDEX);
  let payloadOffset = headerLength;

  for (let y = 0; y < height; y += 1) {
    const { x, count } = spans[y];
    source.copy(output, y * width + x, payloadOffset, payloadOffset + count);
    payloadOffset += count;
  }

  return output;
}

function decodeInterleavedRows16(source, width, height) {
  let offset = 0;
  const output = Buffer.alloc(width * height, TRANSPARENT_INDEX);

  for (let y = 0; y < height; y += 1) {
    if (offset + 4 > source.length) {
      return null;
    }

    const x = source.readUInt16LE(offset);
    const count = source.readUInt16LE(offset + 2);
    offset += 4;

    if (x + count > width || offset + count > source.length) {
      return null;
    }

    source.copy(output, y * width + x, offset, offset + count);
    offset += count;
  }

  return offset === source.length ? output : null;
}

function decodeSeparatedRows16(source, width, height) {
  const headerLength = height * 4;
  if (source.length < headerLength) {
    return null;
  }

  let totalPayload = 0;
  const spans = [];

  for (let y = 0; y < height; y += 1) {
    const offset = y * 4;
    const x = source.readUInt16LE(offset);
    const count = source.readUInt16LE(offset + 2);

    if (x + count > width) {
      return null;
    }

    totalPayload += count;
    spans.push({ x, count });
  }

  if (headerLength + totalPayload > source.length) {
    return null;
  }

  const output = Buffer.alloc(width * height, TRANSPARENT_INDEX);
  let payloadOffset = headerLength;

  for (let y = 0; y < height; y += 1) {
    const { x, count } = spans[y];
    source.copy(output, y * width + x, payloadOffset, payloadOffset + count);
    payloadOffset += count;
  }

  return output;
}

function createIhdr(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return ihdr;
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

let crcTable = null;

function crc32(buffer) {
  if (!crcTable) {
    crcTable = createCrcTable();
  }

  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable() {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }

  return table;
}
