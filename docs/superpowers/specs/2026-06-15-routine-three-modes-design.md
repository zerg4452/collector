# 운동 루틴 3-mode 설계

작성일: 2026-06-15

## 배경

기존에는 `AppSettings.routineTabEnabled: boolean` 으로 루틴 탭의 표시/숨김만
제어했다. 이를 3개 모드로 확장한다.

1. **off** — 루틴/타이머 기능 완전 꺼짐
2. **routine** — 기존 운동 루틴 모드
3. **timer** — 단순 타이머 모드 (30초/60초 카운트다운)

## 데이터 모델

`src/types.ts` 의 `AppSettings`:

```ts
// 변경 전
routineTabEnabled: boolean;

// 변경 후
routineMode: "off" | "routine" | "timer";
```

`routineTabEnabled` 필드는 제거한다.

### 기본값

`src/domain/workout.ts` 의 `defaultSettings`: `routineMode: "routine"`.

### 마이그레이션

`src/storage/db.ts` 로드 시:

- 저장본에 `routineMode` 가 있으면 그대로 사용한다.
- 없으면 (이전 boolean 사용자) `routineTabEnabled === false ? "off" : "routine"`
  으로 매핑한다.

이전 커밋에서 이미 `routineTabEnabled` 가 출시되었으므로 기존 사용자 설정을
보존한다.

## 모드별 동작

| 모드 | 루틴 탭 | 운동 화면 메인 | 플로팅 레이어 |
|------|---------|----------------|---------------|
| off | 숨김 | 유튜브 플레이어만 (운동 목록 없음) | 드래그 · 다음 영상 · 전체화면 |
| routine | 보임 | 유튜브 + 운동 목록 | 기존 그대로 (진행 라벨 · 휴식 타이머 · 세트 완료 · 되돌리기 · 다음 영상 · 전체화면) |
| timer | 숨김 | 유튜브 플레이어만 (운동 목록 없음) | 드래그 · 30초/60초 버튼 · 타이머 박스 · 다음 영상 · 전체화면 |

헤딩:

- off: 루틴 이름 영역 비움 (혹은 "운동")
- routine: 활성 루틴 이름
- timer: "타이머"

## 타이머 동작 (timer 모드)

- **1회성**: 30초 또는 60초부터 카운트다운 → 0초 도달 시 알람 1회 → 정지.
  자동 반복하지 않는다.
- **진행 중 버튼 재클릭**:
  - 진행 중인 것과 같은 버튼(예: 30초 도는 중 30초) → 취소(정지·리셋).
  - 다른 버튼(예: 30초 도는 중 60초) → 60초로 재시작.
- **알람**: 기존 `playAlarm(settings)` + `restAlert` 시각 효과를 재사용한다.
  `restEndSoundEnabled` / `restEndVisualAlertEnabled` / `alarmVolume` 설정을
  루틴 휴식 알람과 공유한다.

## 타이머 상태 관리

기존 루틴 진행 엔진(`session.phase`, `remainingRestSeconds`, `finishRest`)과
**분리된 별도 타이머 상태**를 사용한다. `finishRest` 는 루틴 진행을
전진시키므로 단순 타이머에 부적합하다.

`App.tsx`:

- `timerRemaining: number` — 남은 초. 0이면 정지 상태.
- `timerDuration: number | null` — 현재 도는 타이머의 원래 값(30 또는 60).
  같은 버튼 재클릭(취소) 판별에 사용.
- 전용 `useEffect` interval — `timerRemaining > 0` 이면 1초마다 감소,
  1초 이하에서 `playAlarm` + `restAlert` 시각 효과 후 정지.
- `handleTimer(seconds)` 핸들러:
  - 현재 `timerDuration === seconds` 이고 도는 중이면 취소.
  - 아니면 `timerRemaining = seconds`, `timerDuration = seconds` 로 시작.

## 컴포넌트 변경

### src/views/SettingsView.tsx

"루틴 탭 표시" 체크박스를 3-선택 라디오 그룹(또는 셀렉트)으로 교체한다.

- 끄기 (off)
- 운동 루틴 (routine)
- 단순 타이머 (timer)

### src/App.tsx

- `visibleTabs`: 루틴 탭은 `routineMode === "routine"` 일 때만 노출.
- 탭 폴백: 현재 탭이 `routines` 인데 모드가 `routine` 이 아니게 되면
  `workout` 으로 전환.
- 타이머 state + interval effect + `handleTimer` 추가.
- WorkoutView 에 `mode`, `timerRemaining`, `timerDuration`, `onTimer` 전달.

### src/views/WorkoutView.tsx

- `mode` prop 으로 분기.
- 플로팅 레이어: 모드별 3가지 변형 (위 표 참조).
- 운동 목록(`workout-list`): `routine` 모드에서만 렌더.
- 헤딩: 모드별 텍스트.
- 타이머 박스: routine 모드는 휴식 잔여초, timer 모드는 `timerRemaining`.

## 테스트

- `src/domain/workout.test.ts` 패턴을 따라 순수 함수가 추가되면 단위 테스트.
  (타이머 토글 판별 로직을 순수 함수로 추출하면 테스트 대상.)
- 타입 체크 `npx tsc --noEmit` 통과.
- 브라우저 검증: 3개 모드 전환, 타이머 30/60 시작·취소·재시작·알람,
  루틴 탭 노출 규칙, 새로고침 후 설정 유지.
