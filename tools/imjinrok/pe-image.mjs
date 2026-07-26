import { readFileSync } from "node:fs";

export function readPeImage(executablePath) {
  const buffer = readFileSync(executablePath);
  return {
    buffer,
    image: parsePeImage(buffer, executablePath),
  };
}

export function parsePeImage(buffer, executablePath) {
  if (buffer.toString("ascii", 0, 2) !== "MZ") {
    throw new Error(`${executablePath} is not an MZ executable`);
  }

  const peOffset = buffer.readUInt32LE(0x3c);
  if (buffer.toString("ascii", peOffset, peOffset + 4) !== "PE\u0000\u0000") {
    throw new Error(`${executablePath} is not a PE executable`);
  }

  const numberOfSections = buffer.readUInt16LE(peOffset + 6);
  const optionalHeaderSize = buffer.readUInt16LE(peOffset + 20);
  const optionalHeaderOffset = peOffset + 24;
  const optionalMagic = buffer.readUInt16LE(optionalHeaderOffset);
  const imageBase =
    optionalMagic === 0x10b
      ? buffer.readUInt32LE(optionalHeaderOffset + 28)
      : Number(buffer.readBigUInt64LE(optionalHeaderOffset + 24));
  const sectionTableOffset = optionalHeaderOffset + optionalHeaderSize;
  const sections = [];

  for (let index = 0; index < numberOfSections; index += 1) {
    const offset = sectionTableOffset + index * 40;
    sections.push({
      name: buffer.toString("ascii", offset, offset + 8).replace(/\u0000.*$/, ""),
      virtualSize: buffer.readUInt32LE(offset + 8),
      virtualAddress: buffer.readUInt32LE(offset + 12),
      rawSize: buffer.readUInt32LE(offset + 16),
      rawPointer: buffer.readUInt32LE(offset + 20),
    });
  }

  return {
    imageBase,
    sections,
    rawOffsetToVa(rawOffset) {
      const section = sections.find((candidate) => isRawOffsetInSection(rawOffset, candidate));
      if (!section) {
        return imageBase + rawOffset;
      }

      return imageBase + section.virtualAddress + (rawOffset - section.rawPointer);
    },
    vaToRawOffset(va) {
      const relativeVa = va - imageBase;
      const section = sections.find((candidate) => {
        const sectionSize = Math.max(candidate.virtualSize, candidate.rawSize);
        return relativeVa >= candidate.virtualAddress && relativeVa < candidate.virtualAddress + sectionSize;
      });
      if (!section) {
        return undefined;
      }

      return section.rawPointer + (relativeVa - section.virtualAddress);
    },
  };
}

export function readCString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }

  return buffer.toString("ascii", offset, end);
}

export function toHex(value) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function isRawOffsetInSection(rawOffset, section) {
  return rawOffset >= section.rawPointer && rawOffset < section.rawPointer + section.rawSize;
}
