import type { ScenarioBriefingLineDefinition } from "@shared";

export const MISSION_LINE_VOICE_PADDING_MS = 650;
export const MIN_MISSION_LINE_DURATION_MS = 2_200;

export const MISSION_VOICE_DURATIONS_MS = {
  k01010: 7_683,
  k01020: 13_621,
  k01030: 12_035,
  k01040: 5_659,
  k01050: 8_181,
  k01060: 9_170,
  k01070: 6_744,
  k01080: 12_611,
  k01090: 14_611,
  k01100: 14_032,
  k01110: 2_540,
  k01112: 2_906,
  k01114: 3_619,
  k01116: 3_249,
  k01120: 1_990,
  k01130: 5_723,
  k01140: 4_225,
  k02010: 2_759,
  k02020: 12_679,
  k02030: 19_937,
  k02040: 18_710,
  k02050: 19_872,
  k02060: 3_095,
  k02070: 6_388,
  k02080: 7_233,
  k02090: 3_810,
  k02100: 3_458,
  k02110: 2_684,
  k02120: 6_922,
  k02130: 4_981,
  k02140: 7_735,
  k02150: 2_500,
  k02160: 3_500,
  k02170: 4_387,
  k02180: 3_045,
  k02190: 4_656,
  k02200: 2_292,
  k02210: 8_230,
  k02220: 8_433,
  k02230: 7_686,
  k02260: 1_240,
} as const satisfies Readonly<Record<string, number>>;

export function getMissionLineDurationMs(
  line: Pick<ScenarioBriefingLineDefinition, "voiceId">,
  fallbackMs: number,
): number {
  const voiceDurationMs = MISSION_VOICE_DURATIONS_MS[normalizeMissionVoiceId(line.voiceId)];

  if (!Number.isFinite(voiceDurationMs)) {
    return fallbackMs;
  }

  return Math.max(MIN_MISSION_LINE_DURATION_MS, voiceDurationMs + MISSION_LINE_VOICE_PADDING_MS);
}

export function normalizeMissionVoiceId(voiceId: string): keyof typeof MISSION_VOICE_DURATIONS_MS {
  return voiceId.trim().toLowerCase() as keyof typeof MISSION_VOICE_DURATIONS_MS;
}
