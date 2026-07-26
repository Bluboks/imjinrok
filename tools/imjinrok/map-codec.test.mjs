import test from "node:test";
import assert from "node:assert/strict";
import {
  MAP_DIMENSIONS_OFFSET,
  MAP_RECORDS_END_OFFSET,
  MAP_ENTITY_OWNER_OFFSET,
  MAP_ENTITY_TYPE_OFFSET,
  MAP_ENTITY_X_OFFSET,
  MAP_ENTITY_Y_OFFSET,
  extractMapEntities,
  getMapRecordOffset,
  parseMapHeader,
  readMapRecord,
  recordSignature,
  summarizeRecordClusters,
} from "./map-codec.mjs";

test("summarizeRecordClusters reports absolute coordinates for a scan window", () => {
  const buffer = createMapBuffer(8, 8);
  writeRecord(buffer, 2, 3, 0x0f);
  writeRecord(buffer, 3, 3, 0x0f);
  writeRecord(buffer, 5, 5, 0x80);
  const header = parseMapHeader(buffer, "fixture.map");

  const report = summarizeRecordClusters(buffer, header, { x: 2, y: 3, width: 2, height: 1 });

  assert.equal(report.nonZeroRecords, 2);
  assert.deepEqual(report.nonZeroBoundingBox, { minX: 2, minY: 3, maxX: 3, maxY: 3 });
  assert.equal(report.clusterCount, 1);
  assert.equal(report.clusters[0].count, 2);
  assert.deepEqual(report.clusters[0].boundingBox, { minX: 2, minY: 3, maxX: 3, maxY: 3 });
});

test("map record probes expose the original 16-byte signature", () => {
  const buffer = createMapBuffer(8, 8);
  writeRecord(buffer, 6, 7, 0x80);

  const record = readMapRecord(buffer, 6, 7);

  assert.equal(recordSignature(record.bytes), "80808080808080808080808080808080");
  assert.deepEqual(record.uint16, [32896, 32896, 32896, 32896, 32896, 32896, 32896, 32896]);
});

test("summarizeRecordClusters rejects windows outside declared map dimensions", () => {
  const buffer = createMapBuffer(8, 8);
  const header = parseMapHeader(buffer, "fixture.map");

  assert.throws(
    () => summarizeRecordClusters(buffer, header, { x: 7, y: 7, width: 2, height: 1 }),
    /outside fixture\.map dimensions 8x8/,
  );
});

test("extractMapEntities decodes the source type/x/y/owner arrays", () => {
  const buffer = createMapBuffer(8, 8);
  writeEntity(buffer, 3, { typeId: 0x4e, x: 5, y: 6, ownerId: 0 });
  writeEntity(buffer, 4, { typeId: 0x0c, x: 7, y: 7, ownerId: 1 });
  writeEntity(buffer, 5, { typeId: 0x0d, x: 12, y: 7, ownerId: 1 });
  const header = parseMapHeader(buffer, "fixture.map");

  const report = extractMapEntities(buffer, header);

  assert.equal(report.activeCount, 2);
  assert.deepEqual(report.byOwnerId, { "0": 1, "1": 1 });
  assert.deepEqual(report.byTypeHex, { "0x0c": 1, "0x4e": 1 });
  assert.deepEqual(report.entities, [
    { index: 3, typeId: 0x4e, typeHex: "0x4e", x: 5, y: 6, ownerId: 0, active: true },
    { index: 4, typeId: 0x0c, typeHex: "0x0c", x: 7, y: 7, ownerId: 1, active: true },
  ]);
});

function createMapBuffer(width, height) {
  const buffer = Buffer.alloc(MAP_RECORDS_END_OFFSET);
  buffer.writeUInt32LE(width, MAP_DIMENSIONS_OFFSET);
  buffer.writeUInt32LE(height, MAP_DIMENSIONS_OFFSET + 4);
  return buffer;
}

function writeRecord(buffer, x, y, value) {
  buffer.fill(value, getMapRecordOffset(x, y), getMapRecordOffset(x, y) + 16);
}

function writeEntity(buffer, index, entity) {
  buffer.writeInt16LE(entity.typeId, MAP_ENTITY_TYPE_OFFSET + index * 2);
  buffer.writeInt16LE(entity.x, MAP_ENTITY_X_OFFSET + index * 2);
  buffer.writeInt16LE(entity.y, MAP_ENTITY_Y_OFFSET + index * 2);
  buffer.writeInt16LE(entity.ownerId, MAP_ENTITY_OWNER_OFFSET + index * 2);
}
