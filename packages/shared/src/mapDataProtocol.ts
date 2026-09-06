import { K01_MAP_DATA_PROTOCOL } from "./generated/k01MapDataProtocol.js";

export const K01_MAP_DATA_PROTOCOL_VERSION = K01_MAP_DATA_PROTOCOL.protocolVersion;
export const K01_MAP_DATA_PROTOCOL_PROFILE_ID = K01_MAP_DATA_PROTOCOL.profileId;
const EXPECTED_DIMENSIONS = { width: 60, height: 60 } as const;
const EXPECTED_CHANNEL_IDS = [
  "field_0x32514_raw",
  "field_0x32514_low_nibble",
  "objectIndex",
  "frameIndex",
  "fogFamily",
  "placementSelector",
  "placementLookup",
  "placementHelperResult",
  "rawRasterVerticalShift",
  "passabilityPrimary",
  "passabilityAuxiliary",
] as const;
const EXPECTED_CHANNEL_DIGESTS: Record<(typeof EXPECTED_CHANNEL_IDS)[number], string> = {
  field_0x32514_raw: "6dd13ef5c9b57e69567a20d556e7c9a257a48d32337fdc5bdc07c288e4e2933a",
  field_0x32514_low_nibble: "6dd13ef5c9b57e69567a20d556e7c9a257a48d32337fdc5bdc07c288e4e2933a",
  objectIndex: "905b0deb2b68f2ea4b4332255a4a49472ed69563a4bfcac68646ec14de6c9881",
  frameIndex: "7904f0413f370b288b7c7f1bc9113fd4fc856529d06849b7a47f3c86579b2297",
  fogFamily: "7a9fcc150cf0128af19d57f742a6c160c6b5b8b003a81c069fb3167427208f88",
  placementSelector: "5938e85f3671d6c464c1b3af9a429dbfc2cf1905a2f4943302660b458f91440b",
  placementLookup: "e7331ac9f6c848074249f9b44c2fa4da3b372afff01b8a34efa6695aa66d9260",
  placementHelperResult: "bb5e2d1260addc719ba843e1582a3b5d889e585b7c5872f3a227c57388d4d770",
  rawRasterVerticalShift: "4b58471674a5e89bb553cb995474a3847458eb9e295d68aef057439093b0fb52",
  passabilityPrimary: "c7ff06e4148c20ed8eeb1de8f409fd2a8068b3a716888879c92a98ec14149f68",
  passabilityAuxiliary: "097951c3f1a907741e797ba9873dc6f81f4686d0fecc1877059371bf7c0469b7",
};

export function getK01MapProtocolChannel(channelId: keyof typeof K01_MAP_DATA_PROTOCOL.channels): Uint8Array {
  const stream = K01_MAP_DATA_PROTOCOL.channels[channelId];
  const decoded = decodeBase64(stream.valuesBase64);
  if (decoded.length !== stream.byteCount) throw new Error(`K01 map protocol channel '${channelId}' byte count mismatch.`);
  return decoded;
}

export function getK01MapProtocolCell(channelId: keyof typeof K01_MAP_DATA_PROTOCOL.channels, x: number, y: number): number {
  assertK01MapProtocolCoordinate(x, y);
  const stream = K01_MAP_DATA_PROTOCOL.channels[channelId];
  const bytes = getK01MapProtocolChannel(channelId);
  const index = x * K01_MAP_DATA_PROTOCOL.dimensions.height + y;
  return stream.byteCount === stream.count ? bytes[index] ?? failMissing(channelId, index) : readInt16LittleEndian(bytes, index * 2);
}

export function assertK01MapProtocolArtifact(): void {
  if (K01_MAP_DATA_PROTOCOL.protocolVersion !== "map-data-protocol/v1") throw new Error("K01 map protocol version mismatch.");
  if (K01_MAP_DATA_PROTOCOL.profileId !== "k01-terrain-map-v1") throw new Error("K01 map protocol profile mismatch.");
  if (K01_MAP_DATA_PROTOCOL.dimensions.width !== EXPECTED_DIMENSIONS.width || K01_MAP_DATA_PROTOCOL.dimensions.height !== EXPECTED_DIMENSIONS.height) throw new Error("K01 map protocol dimensions mismatch.");
  if (K01_MAP_DATA_PROTOCOL.themeId !== 0 || K01_MAP_DATA_PROTOCOL.theme !== "normal" || K01_MAP_DATA_PROTOCOL.themeName !== "normal" || K01_MAP_DATA_PROTOCOL.themeNameResolution !== "resolved") throw new Error("K01 map protocol theme metadata mismatch.");
  if (JSON.stringify(K01_MAP_DATA_PROTOCOL.sources) !== JSON.stringify({
    map: { path: "original/imjinrok2/stagemap/k01.map", size: 1_097_100, sha256: "43ec3a173032f74c12d3cce1db1078b076b651ed79070a0914673a5b65da99cb" },
    executable: { path: "original/imjinrok2/imjinrok2.exe", size: 843_833, sha256: "25a95d568082478ce0f50c89c9bbb9536ef33eb6904afa62903e9d63b7a5d03e" },
  })) throw new Error("K01 map protocol source metadata mismatch.");
  const actualIds = Object.keys(K01_MAP_DATA_PROTOCOL.channels);
  if (actualIds.length !== EXPECTED_CHANNEL_IDS.length || actualIds.some((id, index) => id !== EXPECTED_CHANNEL_IDS[index])) throw new Error("K01 map protocol channel set mismatch.");
  const expectedCount = EXPECTED_DIMENSIONS.width * EXPECTED_DIMENSIONS.height;
  for (const channelId of EXPECTED_CHANNEL_IDS) {
    const stream = K01_MAP_DATA_PROTOCOL.channels[channelId];
    const schema = K01_MAP_DATA_PROTOCOL.channelSchemas.find((entry) => entry.id === channelId);
    if (!schema || stream.count !== expectedCount || stream.byteCount !== expectedCount * (schema.storageWidth === "int16" ? 2 : 1)) throw new Error(`K01 map protocol channel '${channelId}' count/byteCount mismatch.`);
    const bytes = decodeBase64(stream.valuesBase64, channelId);
    if (bytes.length !== stream.byteCount || stream.sha256.length !== 64 || !/^[0-9a-f]+$/u.test(stream.sha256) || stream.sha256 !== EXPECTED_CHANNEL_DIGESTS[channelId]) throw new Error(`K01 map protocol channel '${channelId}' digest metadata mismatch.`);
    const values = schema.storageWidth === "int16" ? decodeInt16Values(bytes) : [...bytes];
    if (values.length === 0 || stream.valueRange.min !== Math.min(...values) || stream.valueRange.max !== Math.max(...values)) throw new Error(`K01 map protocol channel '${channelId}' value range mismatch.`);
    if (JSON.stringify(stream.dimensions) !== JSON.stringify(EXPECTED_DIMENSIONS)) throw new Error(`K01 map protocol channel '${channelId}' dimensions mismatch.`);
  }
}

function assertK01MapProtocolCoordinate(x: number, y: number): void {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= K01_MAP_DATA_PROTOCOL.dimensions.width || y < 0 || y >= K01_MAP_DATA_PROTOCOL.dimensions.height) {
    throw new RangeError(`K01 map protocol coordinate outside ${K01_MAP_DATA_PROTOCOL.dimensions.width}x${K01_MAP_DATA_PROTOCOL.dimensions.height}: ${x},${y}`);
  }
}

function decodeBase64(value: string, channelId = "channel"): Uint8Array {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error(`K01 map protocol channel '${channelId}' has invalid base64.`);
  const decoded = globalThis.atob(value);
  const canonical = globalThis.btoa(decoded);
  if (canonical !== value) throw new Error(`K01 map protocol channel '${channelId}' has non-canonical base64.`);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

function decodeInt16Values(bytes: Uint8Array): number[] {
  if (bytes.length % 2 !== 0) throw new Error("K01 map protocol int16 stream has odd byte length.");
  const values: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) values.push(readInt16LittleEndian(bytes, offset));
  return values;
}

function readInt16LittleEndian(bytes: Uint8Array, offset: number): number {
  const low = bytes[offset];
  const high = bytes[offset + 1];
  if (low === undefined || high === undefined) throw new Error(`K01 map protocol int16 stream is truncated at ${offset}.`);
  const value = low | (high << 8);
  return value & 0x8000 ? value - 0x10000 : value;
}

function failMissing(channelId: string, index: number): never {
  throw new Error(`K01 map protocol channel '${channelId}' is truncated at ${index}.`);
}
