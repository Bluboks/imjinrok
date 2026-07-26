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
      japaneseBarracks:
        unitDefinitions["japanese-camp-barracks"].displayName,
      japaneseFirehouse:
        unitDefinitions["japanese-camp-firehouse"].displayName,
      japaneseGunner: unitDefinitions["japanese-gunner"].displayName,
      japaneseHouse: unitDefinitions["japanese-camp-house"].displayName,
      japaneseSwordsman:
        unitDefinitions["japanese-swordsman"].displayName,
      japaneseTower: unitDefinitions["japanese-camp-tower"].displayName,
      gwonYul: unitDefinitions["gwon-yul"].displayName,
      royalCart: unitDefinitions["royal-cart"].displayName,
      ryuSeongRyong:
        unitDefinitions["ryu-seong-ryong"].displayName,
      swordsman: unitDefinitions.swordsman.displayName,
      townCenter: unitDefinitions["town-center"].displayName,
    },
    {
      archer: "조선 궁수",
      barracks: "조선 훈련소",
      beacon: "조선 봉화대",
      house: "조선 방앗간",
      japaneseBarracks: "일본 훈련소",
      japaneseFirehouse: "일본 관측소",
      japaneseGunner: "일본 조총병",
      japaneseHouse: "일본 시장",
      japaneseSwordsman: "일본 창병",
      japaneseTower: "일본 망루",
      gwonYul: "조선 권율",
      royalCart: "조선 선조의 어가",
      ryuSeongRyong: "조선 유성룡",
      swordsman: "조선 창병",
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
