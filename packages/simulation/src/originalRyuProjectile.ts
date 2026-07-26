export const ORIGINAL_RYU_PROJECTILE_SUBTYPE = 0x0c;
export const ORIGINAL_RYU_PROJECTILE_EFFECT_KIND = 9;
export const ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL = 14;
export const ORIGINAL_PROJECTILE_SLOT_COUNT = 100;
export const ORIGINAL_PROJECTILE_POOL_RANDOM_MULTIPLIER = 0xff83;
export const ORIGINAL_PROJECTILE_POOL_RANDOM_MODULUS = 0xfffb;

const FIRST_ALLOCATABLE_PROJECTILE_SLOT = 1;
const MAX_ROUTE_POINTS = 160;
const ORIGINAL_PROJECTILE_RECORD_SIZE = 0x03a0;
const ROUTE_X_OFFSET = 0x011c;
const ROUTE_Y_OFFSET = 0x025c;

export interface OriginalProjectilePoint {
  x: number;
  y: number;
}

export interface OriginalProjectileRoute {
  points: OriginalProjectilePoint[];
  finalRouteIndex: number;
  updateCountUntilImpact: number;
}

export interface OriginalProjectilePoolRandomState {
  seed: number;
  currentSeed: number;
  previousSeed: number;
}

export interface OriginalRyuProjectileImpactInput {
  targetActive: boolean;
  targetGenerationMatches: boolean;
  payload: number;
  defenseBase: number;
  defenseModifier?: number;
  specialDefenseFlag?: number;
  defenderClass: number;
  buffer: number;
  health: number;
  healthApplicationMode?: number;
  /**
   * Raw signed table index from defender byte +0x38.
   * The pure port validates and preserves this input but does not own the
   * original table needed to select a byte from it.
   */
  defenderSignedByte38?: number;
  /**
   * Already-selected raw byte at
   * 0x0082c482 + defenderSignedByte38 * 0x2c10.
   */
  selectedHealthApplicationTableByte?: number;
}

export interface OriginalRyuProjectileImpactResult {
  effectDispatched: boolean;
  calculatedDamage: number;
  damageAppliedToBuffer: number;
  /** WORD operand executed by SUB [health],DX; not the final HP delta. */
  healthSubtractionOperand: number;
  healthApplicationReturn: 0 | 1 | null;
  healthApplicationSkippedByTableGate: boolean;
  buffer: number;
  health: number;
  projectileReleased: true;
}

export function allocateOriginalProjectileSlot(
  activeSubtypes: readonly number[],
): number {
  if (activeSubtypes.length !== ORIGINAL_PROJECTILE_SLOT_COUNT) {
    throw new RangeError(
      `activeSubtypes must contain exactly ${ORIGINAL_PROJECTILE_SLOT_COUNT} words`,
    );
  }

  for (
    let slot = FIRST_ALLOCATABLE_PROJECTILE_SLOT;
    slot < ORIGINAL_PROJECTILE_SLOT_COUNT;
    slot += 1
  ) {
    validateIntegerRange(
      activeSubtypes[slot],
      0,
      0xffff,
      `activeSubtypes[${slot}]`,
    );
    if (activeSubtypes[slot] === 0) {
      return slot;
    }
  }
  return 0;
}

export function advanceOriginalProjectilePoolRandomState({
  seed,
  currentSeed,
}: Omit<
  OriginalProjectilePoolRandomState,
  "previousSeed"
>): OriginalProjectilePoolRandomState {
  validateIntegerRange(seed, 0, 0xffffffff, "seed");
  validateIntegerRange(currentSeed, 0, 0xffffffff, "currentSeed");
  const nextSeed = Number(
    BigInt.asUintN(
      32,
      BigInt(seed) *
        BigInt(ORIGINAL_PROJECTILE_POOL_RANDOM_MULTIPLIER),
    ) %
      BigInt(ORIGINAL_PROJECTILE_POOL_RANDOM_MODULUS),
  );
  return {
    seed: nextSeed,
    currentSeed: nextSeed,
    previousSeed: currentSeed,
  };
}

/**
 * Reproduces the audited route builder only for the conservative 0..32767
 * coordinate subset. The original callers' full signed-WORD range and field
 * producers are not statically proven by this pilot.
 */
export function buildOriginalRyuProjectileRoute({
  startX,
  startY,
  endX,
  endY,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}): OriginalProjectileRoute {
  validateAcceptedRouteCoordinate(startX, "startX");
  validateAcceptedRouteCoordinate(startY, "startY");
  validateAcceptedRouteCoordinate(endX, "endX");
  validateAcceptedRouteCoordinate(endY, "endY");

  const memory = new ArrayBuffer(ORIGINAL_PROJECTILE_RECORD_SIZE);
  const record = new DataView(memory);
  writeRoutePoint(record, 0, startX, startY);

  const deltaX = Math.abs(endX - startX);
  const deltaY = Math.abs(endY - startY);
  let retainedCount = 1;
  let sampleCounter = 0;
  let x = startX;
  let y = startY;

  function retainPoint(): void {
    sampleCounter =
      (sampleCounter + 1) % ORIGINAL_RYU_PROJECTILE_SAMPLE_INTERVAL;
    if (sampleCounter !== 0) {
      return;
    }
    writeRoutePoint(record, retainedCount, x, y);
    if (retainedCount < MAX_ROUTE_POINTS) {
      retainedCount += 1;
    }
  }

  if (deltaY < deltaX) {
    const halfDelta = Math.trunc(deltaX / 2);
    let error = 0;
    const stepX = startX < endX ? 1 : -1;
    const stepY = startY < endY ? 1 : -1;
    while (x !== endX) {
      x += stepX;
      error += deltaY;
      if (error > halfDelta) {
        y += stepY;
        error -= deltaX;
      }
      retainPoint();
    }
  } else if (startY !== endY) {
    const halfDelta = Math.trunc(deltaY / 2);
    let error = 0;
    const stepX = startX < endX ? 1 : -1;
    const stepY = startY < endY ? 1 : -1;
    while (y !== endY) {
      y += stepY;
      error += deltaX;
      if (error > halfDelta) {
        x += stepX;
        error -= deltaY;
      }
      retainPoint();
    }
  }

  const finalRouteIndex = retainedCount - 1;
  return {
    points: Array.from(
      { length: finalRouteIndex + 1 },
      (_, index) => readRoutePoint(record, index),
    ),
    finalRouteIndex,
    updateCountUntilImpact: finalRouteIndex + 1,
  };
}

export function calculateOriginalEffectKindNineDamage({
  payload,
  defenseBase,
  defenseModifier = 0,
  specialDefenseFlag = 0,
  defenderClass,
}: Pick<
  OriginalRyuProjectileImpactInput,
  | "payload"
  | "defenseBase"
  | "defenseModifier"
  | "specialDefenseFlag"
  | "defenderClass"
>): number {
  validateSignedWord(payload, "payload");
  validateSignedWord(defenseBase, "defenseBase");
  validateSignedWord(defenseModifier, "defenseModifier");
  validateIntegerRange(specialDefenseFlag, 0, 0xff, "specialDefenseFlag");
  validateIntegerRange(
    defenderClass,
    0,
    0xffffffff,
    "defenderClass",
  );

  let modifierPercent = 0;
  if (defenderClass === 4) {
    modifierPercent = 30;
  } else if (defenderClass === 5) {
    modifierPercent = 50;
  }
  const modified = addSignedWords(
    payload,
    Math.trunc((payload * modifierPercent) / 100),
  );
  const rawDefense = addSignedWords(defenseBase, defenseModifier);
  let defense = addSignedWords(
    rawDefense,
    specialDefenseFlag === 1 ? Math.trunc(rawDefense / 2) : 0,
  );
  if (defense > 90) {
    defense = 90;
  }
  const resultWord = toSignedWord(
    modified - Math.trunc((defense * modified) / 100),
  );
  return resultWord > 0 ? resultWord : 1;
}

export function resolveOriginalRyuProjectileImpact(
  input: OriginalRyuProjectileImpactInput,
): OriginalRyuProjectileImpactResult {
  if (typeof input.targetActive !== "boolean") {
    throw new TypeError(
      `targetActive must be a boolean; got ${input.targetActive}`,
    );
  }
  if (typeof input.targetGenerationMatches !== "boolean") {
    throw new TypeError(
      `targetGenerationMatches must be a boolean; got ${input.targetGenerationMatches}`,
    );
  }
  validateIntegerRange(input.buffer, 0, 0xffff, "buffer");
  validateIntegerRange(input.health, 0, 0xffff, "health");
  const healthApplicationMode = input.healthApplicationMode ?? 0;
  const defenderSignedByte38 = input.defenderSignedByte38 ?? 0;
  const selectedHealthApplicationTableByte =
    input.selectedHealthApplicationTableByte ?? 1;
  validateIntegerRange(
    healthApplicationMode,
    0,
    0xffff,
    "healthApplicationMode",
  );
  validateIntegerRange(
    defenderSignedByte38,
    -0x80,
    0x7f,
    "defenderSignedByte38",
  );
  validateIntegerRange(
    selectedHealthApplicationTableByte,
    0,
    0xff,
    "selectedHealthApplicationTableByte",
  );

  if (!input.targetActive) {
    return unchangedImpact(input);
  }
  const damage = input.targetGenerationMatches
    ? calculateOriginalEffectKindNineDamage(input)
    : 0;
  if (
    healthApplicationMode === 1 &&
    selectedHealthApplicationTableByte === 0
  ) {
    return {
      effectDispatched: true,
      calculatedDamage: damage,
      damageAppliedToBuffer: 0,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: true,
      buffer: input.buffer,
      health: input.health,
      projectileReleased: true,
    };
  }
  const signedBuffer = toSignedWord(input.buffer);
  if (signedBuffer !== 0 && signedBuffer >= damage) {
    return {
      effectDispatched: true,
      calculatedDamage: damage,
      damageAppliedToBuffer: damage,
      healthSubtractionOperand: 0,
      healthApplicationReturn: 1,
      healthApplicationSkippedByTableGate: false,
      buffer: toUnsignedWord(input.buffer - damage),
      health: input.health,
      projectileReleased: true,
    };
  }
  const healthAfterWordSubtraction = toUnsignedWord(
    input.health - damage,
  );
  const healthRemainsPositive =
    toSignedWord(healthAfterWordSubtraction) > 0;
  return {
    effectDispatched: true,
    calculatedDamage: damage,
    damageAppliedToBuffer: 0,
    healthSubtractionOperand: damage,
    healthApplicationReturn: healthRemainsPositive ? 1 : 0,
    healthApplicationSkippedByTableGate: false,
    buffer: 0,
    health: healthRemainsPositive ? healthAfterWordSubtraction : 0,
    projectileReleased: true,
  };
}

function unchangedImpact(
  input: OriginalRyuProjectileImpactInput,
): OriginalRyuProjectileImpactResult {
  return {
    effectDispatched: false,
    calculatedDamage: 0,
    damageAppliedToBuffer: 0,
    healthSubtractionOperand: 0,
    healthApplicationReturn: null,
    healthApplicationSkippedByTableGate: false,
    buffer: input.buffer,
    health: input.health,
    projectileReleased: true,
  };
}

function writeRoutePoint(
  record: DataView,
  index: number,
  x: number,
  y: number,
): void {
  record.setInt16(ROUTE_X_OFFSET + index * 2, toSignedWord(x), true);
  record.setInt16(ROUTE_Y_OFFSET + index * 2, toSignedWord(y), true);
}

function readRoutePoint(
  record: DataView,
  index: number,
): OriginalProjectilePoint {
  return {
    x: record.getInt16(ROUTE_X_OFFSET + index * 2, true),
    y: record.getInt16(ROUTE_Y_OFFSET + index * 2, true),
  };
}

function toSignedWord(value: number): number {
  return (value << 16) >> 16;
}

function toUnsignedWord(value: number): number {
  return value & 0xffff;
}

function addSignedWords(left: number, right: number): number {
  return toSignedWord(toUnsignedWord(left) + toUnsignedWord(right));
}

function validateAcceptedRouteCoordinate(
  value: number | undefined,
  label: string,
): void {
  validateIntegerRange(value, 0, 0x7fff, label);
}

function validateSignedWord(value: number | undefined, label: string): void {
  validateIntegerRange(value, -0x8000, 0x7fff, label);
}

function validateIntegerRange(
  value: number | undefined,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (
    !Number.isSafeInteger(value) ||
    value === undefined ||
    value < minimum ||
    value > maximum
  ) {
    throw new RangeError(
      `${label} must be an integer in ${minimum}..${maximum}; got ${value}`,
    );
  }
}
