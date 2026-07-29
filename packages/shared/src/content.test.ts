import assert from "node:assert/strict";
import test from "node:test";
import { actionDefinitions, unitDefinitions } from "./content.js";

test("uses statically recovered names for uniquely bound original sprites", () => {
  assert.deepEqual(
    {
      archer: unitDefinitions.archer.displayName,
      barracks: unitDefinitions.barracks.displayName,
      beacon: unitDefinitions.beacon.displayName,
      house: unitDefinitions.house.displayName,
      koreanTrainingCommand: unitDefinitions["korean-training-command"].displayName,
      japaneseBarracks:
        unitDefinitions["japanese-camp-barracks"].displayName,
      japaneseHq: unitDefinitions["japanese-hq"].displayName,
      japaneseFirehouse:
        unitDefinitions["japanese-camp-firehouse"].displayName,
      japaneseFarmer: unitDefinitions["japanese-farmer"].displayName,
      japaneseGunner: unitDefinitions["japanese-gunner"].displayName,
      japaneseKonishi: unitDefinitions["japanese-konishi"].displayName,
      japaneseShrineMaiden: unitDefinitions["japanese-shrine-maiden"].displayName,
      japaneseHouse: unitDefinitions["japanese-camp-house"].displayName,
      japaneseSamurai: unitDefinitions["japanese-samurai"].displayName,
      japaneseSwordsman:
        unitDefinitions["japanese-swordsman"].displayName,
      japaneseTurtleTank:
        unitDefinitions["japanese-turtle-tank"].displayName,
      japaneseTower: unitDefinitions["japanese-camp-tower"].displayName,
      gwonYul: unitDefinitions["gwon-yul"].displayName,
      royalCart: unitDefinitions["royal-cart"].displayName,
      ryuSeongRyong:
        unitDefinitions["ryu-seong-ryong"].displayName,
      swordsman: unitDefinitions.swordsman.displayName,
      villager: unitDefinitions.villager.displayName,
      koreanMonk: unitDefinitions["korean-monk"].displayName,
      townCenter: unitDefinitions["town-center"].displayName,
    },
    {
      archer: "조선 궁수",
      barracks: "조선 훈련소",
      beacon: "조선 봉화대",
      house: "조선 방앗간",
      koreanTrainingCommand: "조선 훈련도감",
      japaneseBarracks: "일본 훈련소",
      japaneseHq: "일본 본영",
      japaneseFirehouse: "일본 관측소",
      japaneseFarmer: "일본 농부",
      japaneseGunner: "일본 조총병",
      japaneseKonishi: "일본 고니시",
      japaneseShrineMaiden: "일본 무녀",
      japaneseHouse: "일본 시장",
      japaneseSamurai: "일본 사무라이",
      japaneseSwordsman: "일본 창병",
      japaneseTurtleTank: "일본 귀갑차",
      japaneseTower: "일본 망루",
      gwonYul: "조선 권율",
      royalCart: "조선 선조의 어가",
      ryuSeongRyong: "조선 유성룡",
      swordsman: "조선 창병",
      villager: "조선 농부",
      koreanMonk: "조선 승병",
      townCenter: "조선 본영",
    },
  );
  assert.deepEqual(
    {
      archer: actionDefinitions["train-archer"].label,
      barracks: actionDefinitions["build-barracks"].label,
      beacon: actionDefinitions["build-beacon"].label,
      house: actionDefinitions.build.label,
      swordsman: actionDefinitions["train-swordsman"].label,
      townCenter: actionDefinitions["build-town-center"].label,
    },
    {
      archer: "조선 궁수 훈련",
      barracks: "조선 훈련소 건설",
      beacon: "조선 봉화대 건설",
      house: "조선 방앗간 건설",
      swordsman: "조선 창병 훈련",
      townCenter: "조선 본영 건설",
    },
  );
});

test("new source identity kinds preserve their explicit project gameplay adapters", () => {
  assert.deepEqual(
    omitIdentity(unitDefinitions["korean-monk"]),
    omitIdentity(unitDefinitions.swordsman),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-samurai"]),
    omitIdentity(unitDefinitions["japanese-swordsman"]),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-turtle-tank"]),
    omitIdentity(unitDefinitions["japanese-swordsman"]),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-konishi"]),
    omitIdentity(unitDefinitions["japanese-gunner"]),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-shrine-maiden"]),
    omitIdentity(unitDefinitions["japanese-gunner"]),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-farmer"]),
    omitIdentity(unitDefinitions["japanese-gunner"]),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["korean-training-command"]),
    omitIdentity(unitDefinitions.house),
  );
  assert.deepEqual(
    omitIdentity(unitDefinitions["japanese-hq"]),
    omitIdentity(unitDefinitions["japanese-camp-barracks"]),
  );
});

function omitIdentity({
  id: _id,
  displayName: _displayName,
  ...adaptedGameplay
}: (typeof unitDefinitions)[keyof typeof unitDefinitions]) {
  return adaptedGameplay;
}
