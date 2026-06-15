# 운동 루틴 3-mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 루틴 기능을 `off` / `routine` / `timer` 3개 모드로 확장하고, timer 모드에서 플로팅 레이어에 30초/60초 1회성 카운트다운을 추가한다.

**Architecture:** `AppSettings.routineTabEnabled: boolean` 을 `routineMode: "off" | "routine" | "timer"` enum 으로 교체. 타이머는 기존 루틴 진행 엔진과 분리된 순수 함수(`workout.ts`)와 별도 React state(`App.tsx`)로 구현한다. `WorkoutView` 는 `mode` prop 으로 플로팅 레이어·운동 목록·헤딩을 분기한다.

**Tech Stack:** React, TypeScript, Vite, Vitest, IndexedDB.

---

## File Structure

- `src/types.ts` — `AppSettings.routineMode` 타입 + `RoutineMode` export
- `src/domain/workout.ts` — `defaultSettings`, 순수 타이머 함수(`initialTimerState`/`toggleTimer`/`tickTimer`)
- `src/domain/workout.test.ts` — 타이머 함수 단위 테스트
- `src/storage/db.ts` — 로드 시 마이그레이션
- `src/views/SettingsView.tsx` — 3-선택 라디오
- `src/App.tsx` — 탭 노출/폴백, 타이머 state·effect·핸들러, props 전달
- `src/views/WorkoutView.tsx` — `mode` 분기

---

### Task 1: 타입 + 기본값 + 순수 타이머 함수 (TDD)

**Files:**
- Modify: `src/types.ts` (AppSettings)
- Modify: `src/domain/workout.ts` (defaultSettings + 타이머 함수)
- Test: `src/domain/workout.test.ts`

- [ ] **Step 1: 타입 교체**

`src/types.ts` 에서 `AppSettings` 의 `routineTabEnabled: boolean;` 줄을 제거하고 다음으로 교체. `RoutineMode` 를 export 한다 (파일 상단 다른 타입들 옆, 예: `Weekday` 정의 부근).

```ts
export type RoutineMode = "off" | "routine" | "timer";
```

`AppSettings` 내부:

```ts
  routineMode: RoutineMode;
```

- [ ] **Step 2: defaultSettings 갱신**

`src/domain/workout.ts` 의 `defaultSettings` 에서 `routineTabEnabled: true` 줄을 다음으로 교체:

```ts
  routineMode: "routine"
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/domain/workout.test.ts` 상단 import 에 `initialTimerState, toggleTimer, tickTimer` 를 추가하고, 파일 끝에 추가:

```ts
describe("simple timer", () => {
  it("starts a timer from the given seconds", () => {
    const next = toggleTimer(initialTimerState(), 30);
    expect(next).toEqual({ remaining: 30, duration: 30 });
  });

  it("cancels when the same running duration is pressed again", () => {
    const running = { remaining: 12, duration: 30 };
    expect(toggleTimer(running, 30)).toEqual({ remaining: 0, duration: null });
  });

  it("restarts with a different duration while running", () => {
    const running = { remaining: 12, duration: 30 };
    expect(toggleTimer(running, 60)).toEqual({ remaining: 60, duration: 60 });
  });

  it("ticks down by one second", () => {
    expect(tickTimer({ remaining: 30, duration: 30 })).toEqual({
      state: { remaining: 29, duration: 30 },
      finished: false
    });
  });

  it("finishes and resets at the last second", () => {
    expect(tickTimer({ remaining: 1, duration: 30 })).toEqual({
      state: { remaining: 0, duration: null },
      finished: true
    });
  });
});
```

- [ ] **Step 4: 실패 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: FAIL — `toggleTimer is not a function` (또는 import 에러).

- [ ] **Step 5: 순수 함수 구현**

`src/domain/workout.ts` 에 추가 (예: `initialWorkoutSession` 정의 부근, 진행 엔진 섹션):

```ts
export type TimerState = { remaining: number; duration: number | null };

export const initialTimerState = (): TimerState => ({ remaining: 0, duration: null });

// 같은 값이 도는 중이면 취소, 아니면 그 값으로 시작한다.
export const toggleTimer = (state: TimerState, seconds: number): TimerState =>
  state.duration === seconds && state.remaining > 0
    ? { remaining: 0, duration: null }
    : { remaining: seconds, duration: seconds };

// 1초 감소. 1초 이하면 정지하고 알람 신호(finished)를 낸다.
export const tickTimer = (
  state: TimerState
): { state: TimerState; finished: boolean } =>
  state.remaining <= 1
    ? { state: { remaining: 0, duration: null }, finished: true }
    : {
        state: { remaining: state.remaining - 1, duration: state.duration },
        finished: false
      };
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: PASS (신규 5개 포함).

- [ ] **Step 7: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `src/storage/db.ts`, `src/views/SettingsView.tsx`, `src/App.tsx`, `src/views/WorkoutView.tsx` 에서 `routineTabEnabled` 관련 에러가 남는다 (이후 Task 에서 해소). `workout.ts`/`types.ts`/`workout.test.ts` 자체 에러는 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add src/types.ts src/domain/workout.ts src/domain/workout.test.ts
git commit -m "feat : routineMode 타입과 단순 타이머 순수 함수 추가"
```

---

### Task 2: 로드 마이그레이션 (db.ts)

**Files:**
- Modify: `src/storage/db.ts:135-143` (settings 구성 블록)

- [ ] **Step 1: import 에 RoutineMode 추가**

`src/storage/db.ts` 상단 타입 import 에 `RoutineMode` 추가.

- [ ] **Step 2: settings 매핑 교체**

현재 (Task 1 이후 타입 에러 상태인) settings 블록:

```ts
  const settings = storedSettings
    ? {
        alarmVolume: storedSettings.alarmVolume,
        restEndSoundEnabled: storedSettings.restEndSoundEnabled,
        restEndVisualAlertEnabled: storedSettings.restEndVisualAlertEnabled,
        floatingControlPosition: storedSettings.floatingControlPosition,
        keyboardShortcutEnabled: storedSettings.keyboardShortcutEnabled,
        routineTabEnabled:
          storedSettings.routineTabEnabled ?? defaultSettings.routineTabEnabled
      }
    : defaultSettings;
```

다음으로 교체:

```ts
  const legacySettings = storedSettings as
    | (typeof storedSettings & {
        routineMode?: RoutineMode;
        routineTabEnabled?: boolean;
      })
    | undefined;

  const settings = legacySettings
    ? {
        alarmVolume: legacySettings.alarmVolume,
        restEndSoundEnabled: legacySettings.restEndSoundEnabled,
        restEndVisualAlertEnabled: legacySettings.restEndVisualAlertEnabled,
        floatingControlPosition: legacySettings.floatingControlPosition,
        keyboardShortcutEnabled: legacySettings.keyboardShortcutEnabled,
        // 구버전(boolean) 사용자: false→off, 그 외→routine
        routineMode:
          legacySettings.routineMode ??
          (legacySettings.routineTabEnabled === false ? "off" : "routine")
      }
    : defaultSettings;
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `db.ts` 에러 해소. 남은 에러는 `SettingsView.tsx`/`App.tsx`/`WorkoutView.tsx` 뿐.

- [ ] **Step 4: 커밋**

```bash
git add src/storage/db.ts
git commit -m "feat : 저장된 설정을 routineMode로 마이그레이션"
```

---

### Task 3: 설정 3-선택 UI (SettingsView)

**Files:**
- Modify: `src/views/SettingsView.tsx`

- [ ] **Step 1: 체크박스를 라디오 그룹으로 교체**

`src/views/SettingsView.tsx` 에서 "루틴 탭 표시" 토글 `<label className="toggle-row">...</label>` 블록(routineTabEnabled 사용)을 다음으로 교체:

```tsx
        <fieldset className="radio-group">
          <legend>운동 루틴 모드</legend>
          {([
            { value: "off", label: "끄기" },
            { value: "routine", label: "운동 루틴" },
            { value: "timer", label: "단순 타이머" }
          ] as const).map((option) => (
            <label key={option.value} className="radio-row">
              <input
                type="radio"
                name="routineMode"
                value={option.value}
                checked={settings.routineMode === option.value}
                onChange={() =>
                  onChange({ ...settings, routineMode: option.value })
                }
              />
              {option.label}
            </label>
          ))}
        </fieldset>
```

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `SettingsView.tsx` 에러 해소. 남은 에러는 `App.tsx`/`WorkoutView.tsx`.

- [ ] **Step 3: 커밋**

```bash
git add src/views/SettingsView.tsx
git commit -m "feat : 설정에 운동 루틴 3-mode 라디오 추가"
```

---

### Task 4: App.tsx 배선

**Files:**
- Modify: `src/App.tsx` (import / 타이머 state / interval effect / handleTimer / visibleTabs / 탭 폴백 / WorkoutView props)

- [ ] **Step 1: import 추가**

`src/App.tsx` 의 `./domain/workout` import 에 `initialTimerState`, `toggleTimer`, `tickTimer` 추가. 기존 `setActiveRoutine` 등과 같은 import 블록.

- [ ] **Step 2: 타이머 state 추가**

`const [restAlert, setRestAlert] = useState(false);` 아래에 추가:

```tsx
  const [timer, setTimer] = useState(initialTimerState);
```

- [ ] **Step 3: 타이머 interval effect 추가**

기존 휴식 카운트다운 effect (`if (session.phase !== "rest" ...)` 블록, 대략 `src/App.tsx:530-553`) 아래에 추가:

```tsx
  useEffect(() => {
    if (timer.remaining <= 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setTimer((current) => {
        const { state, finished } = tickTimer(current);
        if (finished) {
          if (data.settings.restEndVisualAlertEnabled) {
            setRestAlert(true);
          }
          playAlarm(data.settings);
        }
        return state;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timer.remaining, data.settings]);
```

- [ ] **Step 4: handleTimer 핸들러 추가**

`handleActivateRoutine` 등 다른 핸들러 부근에 추가:

```tsx
  const handleTimer = (seconds: number) => {
    setRestAlert(false);
    setTimer((current) => toggleTimer(current, seconds));
  };
```

- [ ] **Step 5: visibleTabs 조건 교체**

Task 이전의 `visibleTabs` (routineTabEnabled 사용):

```tsx
  const visibleTabs = tabItems.filter(
    (item) => item.id !== "routines" || data.settings.routineTabEnabled
  );
```

교체:

```tsx
  const visibleTabs = tabItems.filter(
    (item) => item.id !== "routines" || data.settings.routineMode === "routine"
  );
```

- [ ] **Step 6: 탭 폴백 effect 교체**

기존 폴백 effect (routineTabEnabled 사용):

```tsx
  useEffect(() => {
    if (!data.settings.routineTabEnabled && tab === "routines") {
      setTab("workout");
    }
  }, [data.settings.routineTabEnabled, tab]);
```

교체:

```tsx
  useEffect(() => {
    if (data.settings.routineMode !== "routine" && tab === "routines") {
      setTab("workout");
    }
  }, [data.settings.routineMode, tab]);
```

- [ ] **Step 7: WorkoutView props 전달**

`<WorkoutView ... />` 호출에 props 추가 (기존 props 유지):

```tsx
            mode={data.settings.routineMode}
            timerRemaining={timer.remaining}
            timerDuration={timer.duration}
            onTimer={handleTimer}
```

- [ ] **Step 8: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `App.tsx` 에러 해소. 남은 에러는 `WorkoutView.tsx` (신규 props 미정의) 뿐.

- [ ] **Step 9: 커밋**

```bash
git add src/App.tsx
git commit -m "feat : App에 타이머 상태와 모드별 탭 배선 추가"
```

---

### Task 5: WorkoutView 모드 분기

**Files:**
- Modify: `src/views/WorkoutView.tsx`

- [ ] **Step 1: props 타입 + 구조분해 추가**

`WorkoutViewProps` 에 추가:

```ts
  mode: import("../types").RoutineMode;
  timerRemaining: number;
  timerDuration: number | null;
  onTimer: (seconds: number) => void;
```

(또는 상단 `import type { ... }` 에 `RoutineMode` 추가 후 `mode: RoutineMode;` 사용.)

함수 구조분해 인자에 `mode, timerRemaining, timerDuration, onTimer` 추가.

- [ ] **Step 2: 헤딩 분기**

`<h2>{routineName || "활성 루틴 없음"}</h2>` 를 교체:

```tsx
        <h2>
          {mode === "timer"
            ? "타이머"
            : mode === "off"
              ? "운동"
              : routineName || "활성 루틴 없음"}
        </h2>
```

- [ ] **Step 3: 플로팅 레이어 분기**

`<div className="floating-main">...</div>` 부터 `세트 완료`/`되돌리기` 버튼까지(즉 `floating-main` + `timer-box` + `primary-action` + 되돌리기 `icon-button`)를 모드별로 감싼다. `다음 영상`/`전체화면` `icon-button` 2개는 모든 모드 공통으로 둔다.

`floating-main` 시작 직전부터 되돌리기 버튼 끝까지를 다음 구조로 교체:

```tsx
          {mode === "routine" && (
            <>
              <div className="floating-main">
                <span className="floating-label">
                  {session.phase === "rest"
                    ? "휴식"
                    : session.phase === "complete"
                      ? "완료"
                      : block
                        ? `진행 · 라운드 ${session.round}/${block.rounds}`
                        : "진행"}
                </span>
                <strong>{exercise?.name ?? "오늘 운동 없음"}</strong>
                <span>
                  {prescription ? describePrescription(prescription) : "루틴을 준비해 주세요"}
                </span>
                {nextExercise && nextPrescription && (
                  <span className="next-hint">
                    다음: {nextExercise.name} {describePrescription(nextPrescription)} (휴식 없이 바로)
                  </span>
                )}
              </div>
              <div className="timer-box">
                {session.phase === "rest" ? formatSeconds(session.remainingRestSeconds) : "--:--"}
              </div>
              <button
                className="primary-action"
                type="button"
                onClick={onSetComplete}
                disabled={!canCompleteSet}
                title="세트 완료"
              >
                <MousePointerClick size={18} aria-hidden="true" />
                세트 완료
              </button>
              <button
                className="icon-button"
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                title="되돌리기"
              >
                <RotateCcw size={18} aria-hidden="true" />
              </button>
            </>
          )}

          {mode === "timer" && (
            <>
              <button
                className={`primary-action ${timerDuration === 30 ? "active" : ""}`}
                type="button"
                onClick={() => onTimer(30)}
                title="30초 타이머"
              >
                30초
              </button>
              <button
                className={`primary-action ${timerDuration === 60 ? "active" : ""}`}
                type="button"
                onClick={() => onTimer(60)}
                title="60초 타이머"
              >
                60초
              </button>
              <div className="timer-box">
                {timerRemaining > 0 ? formatSeconds(timerRemaining) : "--:--"}
              </div>
            </>
          )}
```

(`다음 영상` 과 `전체화면` `icon-button` 은 이 블록 다음에 기존 그대로 둔다.)

- [ ] **Step 4: 운동 목록 분기**

`<div className="workout-list">...</div>` 전체를 `{mode === "routine" && ( ... )}` 로 감싼다.

- [ ] **Step 5: 타입 체크 + 테스트**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: PASS (전체).

- [ ] **Step 6: 브라우저 검증**

`mcp__Claude_Preview__preview_start` (name `dev`) 후:
- 설정에서 모드 3개 전환 → 루틴 탭 노출 규칙 확인 (routine 만 보임).
- timer 모드: 30초 클릭 → 카운트다운 시작, 60초 클릭 → 60으로 재시작, 30초 도는 중 30초 재클릭 → 취소(`--:--`), 0초 도달 → 알람/시각효과.
- off 모드: 플로팅에 진행/타이머 없음, 운동 목록 없음.
- 새로고침 후 모드 유지.

- [ ] **Step 7: 커밋**

```bash
git add src/views/WorkoutView.tsx
git commit -m "feat : WorkoutView 모드별 플로팅·목록 분기"
```

---

## Self-Review

- **Spec coverage:** 데이터 모델(Task1) · 기본값(Task1) · 마이그레이션(Task2) · 모드별 동작 표(Task4 탭, Task5 화면) · 타이머 동작 1회성·토글(Task1 함수, Task4 effect) · 알람 재사용(Task4) · SettingsView(Task3) · 테스트(Task1, Task5 Step5-6) 전부 매핑됨.
- **Placeholder scan:** 없음. 모든 코드 단계에 실제 코드 포함.
- **Type consistency:** `TimerState {remaining,duration}` Task1 정의 → Task4 `timer.remaining`/`timer.duration` 일치. `toggleTimer`/`tickTimer` 시그니처 Task1↔Task4 일치. `mode`/`timerRemaining`/`timerDuration`/`onTimer` props Task4 전달 ↔ Task5 수신 일치. `RoutineMode` Task1 export ↔ Task2/Task5 import.
