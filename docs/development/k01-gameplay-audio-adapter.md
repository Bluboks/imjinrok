# K01 게임플레이 음성 source adapter

## 범위와 상태

K01 source opening 및 K0120 reinforcement에서 spawn 가능한 project kind의 음성 coverage는
[`K01_GAMEPLAY_AUDIO_COVERAGE`](../../apps/game-client/src/k01GameplayAudioCoverage.ts) 한 곳에서 관리한다.
이 표는 타입 정체의 정적 근거와 웹 제품의 cue 선택을 구분한다. 특히 cue의 `select`/`move`/`attack`
라벨, playback 시점, cooldown은 원본 call-site가 복원되지 않았으므로 **제품 adapter**다. 이 문서는
원작 음향 event parity를 주장하지 않는다.

`source-backed-adapter`는 source filename family와 K01 source entity identity를 재현 가능하게 연결한
새 adapter이고, `already-covered`는 이 변경 전부터 존재한 제품 cue를 inventory에 명시한 것이다.
`unresolved`는 `UNIT_AUDIO_CUES`에 cue를 두지 않아 추측성 기본값을 받지 않는다.

## 일본 농부 adapter

class 31은 catalog record `0x00885644`, sprite pointer cell `0x004bc2d8`,
`char\\farmerj.spr`로 연결되는 `일본 농부`이며 K01 map owner 1 record `(7,48)`, `(7,47)`,
`(48,1)`은 `japanese-farmer`로 source identity가 정적 확정되어 있다.
근거의 전체 control flow와 reproduction vector는
[K01 일본 농부 class 31 핵심 프레임](../reverse-engineering/mechanics/k01-japanese-farmer-frames.md)에 있다.

원본 EXE의 static string table에는 다음 filename family와 data reference가 있다. 이것은 action scheduling
call-site 증거가 아니므로, 파일명과 class 31 identity를 결합한 제품 자원 adapter로만 사용한다.

| source YAV | SHA-256 | string VA | data reference | product cue |
| --- | --- | ---: | --- | --- |
| `tempeft/select_farmerj1.YAV` | `300eb0ed3009e4538e20a1fff87883988d723b35822fa80ac6527e453c60fabd` | `0x004c17f8` | `0x004720ce` | `audio:voice:select-farmer-j1` |
| `tempeft/move_farmerj1.YAV` | `967fac8e7b277ad6d549ced844b75b61148b525397bacd06edf23d2246be950d` | `0x004c0b00` | `0x004726f8` | `audio:voice:move-farmer-j1` |
| `tempeft/attack_farmerj1.YAV` | `e0cdd2624d3f508787793880c608801ddbabadedfcada71bd5f987c9dc233b64` | `0x004c03e8` | `0x00472b0d` | `audio:voice:attack-farmer-j1` |

원본 `Farmerj.spr` SHA-256은
`e6cc67849a872f391c977079fc04118bf06d57b99ad8b5137b02398e26d9cdc5`.
세 WAV는 저장소 YAV converter의 결정론적 출력이며, test는 각 WAV의 PCM format/header와 payload를
원본 YAV와 대조한다. 이 adapter에는 farmer death cue를 추가하지 않는다.

## 명시적 비매핑

class 13 `japanese-samurai`는 정적으로 `horseswordj1.spr`/`horseswordj2.spr`에 결합하며
`swordj.spr`에는 결합하지 않는다. 따라서 `swordj1` voice를 할당하지 않는다. 영웅, 귀갑차, 승병,
무녀, 고니시 역시 정확한 source voice-family identity adapter가 생길 때까지 `unresolved`로 둔다.
inventory test는 `k01SourceOpeningAdapter`와 `k01ReinforcementAdapter`에서 완전한 kind 집합을 도출하고,
누락 kind 또는 추측성 cue를 거부한다.
