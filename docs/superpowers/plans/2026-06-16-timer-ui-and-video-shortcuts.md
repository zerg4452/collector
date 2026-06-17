# 타이머 UI 개선 + 영상 단축키 + 풀스크린 버그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timer 모드 카운트다운/카운트 UI를 개선하고, 전체화면 해제 후 플로팅 레이어가 사라지는 버그를 고치며, 영상 키보드 단축키(IFrame API 기반)를 추가한다.

**Architecture:** 순수 계산은 `src/domain/workout.ts`(타이머 표시·카운트·위치 클램프·seek)와 `src/utils/youtube.ts`(영상 ID 추출)에 두고 단위 테스트한다. UI 분기와 side-effect는 `App.tsx`/`WorkoutView.tsx`에서 처리한다. 5번(IFrame API + 단축키)은 별도 태스크/커밋으로 분리해 결정 게이트에서 통째 되돌릴 수 있게 한다.

**Tech Stack:** React, TypeScript, Vite, Vitest, jsdom, YouTube IFrame Player API.

---

## File Structure

- `src/domain/workout.ts` — `formatRemainingSeconds`, `clampFloatingPosition`, `seekTarget` 순수 함수
- `src/domain/workout.test.ts` — 위 함수 단위 테스트
- `src/utils/youtube.ts` — `toYoutubeVideoId` 순수 함수
- `src/utils/youtube.test.ts` — (없으면 신규) `toYoutubeVideoId` 테스트
- `src/views/WorkoutView.tsx` — timer 플로팅 8칸 순서, 카운트/초기화 UI, 초 표시, 재클램프 통지
- `src/App.tsx` — `timerCount` state, 드래그 클램프 수정, fullscreen/resize 재클램프, 단축키, IFrame 플레이어
- `src/styles.css` — `.floating-control--timer` 8열 grid
- `src/types.ts` — (5번) 필요 시 player 관련 타입은 로컬 정의로 충분, 변경 없음 예상

---

### Task 1: 남은시간 초 표시 (TDD)

**Files:**
- Modify: `src/domain/workout.ts`
- Test: `src/domain/workout.test.ts`
- Modify: `src/views/WorkoutView.tsx`

- [ ] **Step 1: 실패 테스트 추가**

`src/domain/workout.test.ts` import 에 `formatRemainingSeconds` 추가. 파일 끝에:

```ts
describe("formatRemainingSeconds", () => {
  it("shows the integer seconds while running", () => {
    expect(formatRemainingSeconds(59)).toBe("59");
    expect(formatRemainingSeconds(5)).toBe("5");
  });

  it("shows a dash when not running", () => {
    expect(formatRemainingSeconds(0)).toBe("--");
    expect(formatRemainingSeconds(-3)).toBe("--");
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: FAIL — `formatRemainingSeconds is not a function`.

- [ ] **Step 3: 구현**

`src/domain/workout.ts` 에 `formatSeconds` 근처(없으면 진행 엔진 섹션)에 추가:

```ts
// timer 모드 카운트다운: 분:초 대신 정수 초만 표시한다.
export const formatRemainingSeconds = (seconds: number): string =>
  seconds > 0 ? String(Math.floor(seconds)) : "--";
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: PASS.

- [ ] **Step 5: WorkoutView 적용**

`src/views/WorkoutView.tsx` 의 import 에 `formatRemainingSeconds` 추가. timer 분기의 timer-box 를 다음으로 교체:

```tsx
              <div className="timer-box">
                {formatRemainingSeconds(timerRemaining)}
              </div>
```

- [ ] **Step 6: 타입체크 + 커밋**

Run: `npx tsc --noEmit` (clean)

```bash
git add src/domain/workout.ts src/domain/workout.test.ts src/views/WorkoutView.tsx
git commit -m "feat : timer 모드 남은시간을 초 숫자로 표시"
```

---

### Task 2: 타이머 카운트 + 초기화

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/views/WorkoutView.tsx`

- [ ] **Step 1: App 에 카운트 state 추가**

`src/App.tsx` 에서 `const [timer, setTimer] = useState(initialTimerState);` 아래에 추가:

```tsx
  const [timerCount, setTimerCount] = useState(0);
```

- [ ] **Step 2: handleTimer 에서 시작 시 +1**

기존 `handleTimer` 를 다음으로 교체(시작일 때만 증가):

```tsx
  const handleTimer = (seconds: number) => {
    setRestAlert(false);
    setTimer((current) => {
      const next = toggleTimer(current, seconds);
      if (next.remaining > 0) {
        setTimerCount((count) => count + 1);
      }
      return next;
    });
  };
```

- [ ] **Step 3: 초기화 핸들러 추가**

`handleTimer` 아래에 추가:

```tsx
  const handleResetTimerCount = () => setTimerCount(0);
```

- [ ] **Step 4: 모드 전환 시 카운트 리셋**

기존 모드 변경 effect(비활성 세션/타이머/알람 리셋)에 카운트 리셋을 추가. `if (data.settings.routineMode !== "timer") { setTimer(initialTimerState()); }` 블록 안에 `setTimerCount(0);` 를 더한다:

```tsx
    if (data.settings.routineMode !== "timer") {
      setTimer(initialTimerState());
      setTimerCount(0);
    }
```

- [ ] **Step 5: WorkoutView props 추가**

`WorkoutViewProps` 에 추가:

```ts
  timerCount: number;
  onResetTimerCount: () => void;
```

함수 구조분해 인자에 `timerCount, onResetTimerCount` 추가. `<WorkoutView>` 호출(App.tsx)에 전달:

```tsx
            timerCount={timerCount}
            onResetTimerCount={handleResetTimerCount}
```

- [ ] **Step 6: 타입체크 + 커밋**

Run: `npx tsc --noEmit` (clean; WorkoutView 가 아직 UI 미배치여도 props 사용은 Task3에서. 미사용 변수 경고 없으면 통과. 경고 시 Task3와 함께 진행)

```bash
git add src/App.tsx src/views/WorkoutView.tsx
git commit -m "feat : 타이머 시작 카운트 상태와 초기화 핸들러 추가"
```

---

### Task 3: timer 플로팅 8칸 순서 (카운트·초기화 UI + grid)

**Files:**
- Modify: `src/views/WorkoutView.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: timer 분기 JSX 재배치**

`src/views/WorkoutView.tsx` 의 `{mode === "timer" && ( ... )}` 블록을 다음 순서로 교체(드래그 핸들은 이 블록 밖 상단에 이미 있음 → 그대로 두고, 카운트→30→60→초기화→남은초 순서):

```tsx
          {mode === "timer" && (
            <>
              <div className="timer-count" title="타이머 실행 횟수">
                {timerCount}회
              </div>
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
              <button
                className="icon-button"
                type="button"
                onClick={onResetTimerCount}
                title="카운트 초기화"
              >
                <RotateCcw size={18} aria-hidden="true" />
              </button>
              <div className="timer-box">
                {formatRemainingSeconds(timerRemaining)}
              </div>
            </>
          )}
```

(`RotateCcw` 는 이미 import 되어 있음. 다음 영상/전체화면 icon-button 은 이 블록 뒤 공통으로 유지.)

- [ ] **Step 2: grid 8열 정의**

`src/styles.css` 의 `.floating-control--timer` 를 교체:

```css
/* timer 모드: 드래그 · 카운트 · 30초 · 60초 · 초기화 · 남은초 · 다음영상 · 전체화면 */
.floating-control--timer {
  grid-template-columns: 36px 56px 82px 82px 40px 64px 40px 40px;
  min-width: 0;
  max-width: max-content;
}

.timer-count {
  display: grid;
  place-items: center;
  height: 40px;
  border-radius: 8px;
  background: #f1ede5;
  color: var(--ink);
  font-weight: 800;
}
```

- [ ] **Step 3: 타입체크 + 테스트**

Run: `npx tsc --noEmit` (clean)
Run: `npx vitest run` (all pass)

- [ ] **Step 4: 브라우저 검증**

`mcp__Claude_Preview__preview_start` (name `dev`), 뷰포트 1280, timer 모드 운동 화면:
- 순서 확인: 드래그 │ `0회` │ 30초 │ 60초 │ 초기화 │ `--` │ 다음 │ 전체화면.
- 30초 클릭 → `1회`, 남은초 숫자 감소. 60초 → `2회`. 30초 도는 중 30초 재클릭(취소) → 카운트 증가 안 함.
- 초기화 클릭 → `0회`.

- [ ] **Step 5: 커밋**

```bash
git add src/views/WorkoutView.tsx src/styles.css
git commit -m "feat : timer 플로팅에 카운트·초기화 배치 및 8열 grid"
```

---

### Task 4: 전체화면 해제 후 플로팅 숨김 버그 (TDD + 수정)

**Files:**
- Modify: `src/domain/workout.ts`
- Test: `src/domain/workout.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/views/WorkoutView.tsx`

- [ ] **Step 1: 클램프 함수 실패 테스트**

`src/domain/workout.test.ts` import 에 `clampFloatingPosition` 추가. 끝에:

```ts
describe("clampFloatingPosition", () => {
  it("keeps a position already inside the stage", () => {
    expect(clampFloatingPosition({ x: 50, y: 40 }, 800, 500, 660, 70)).toEqual({
      x: 50,
      y: 40
    });
  });

  it("pulls an off-stage position back within bounds", () => {
    // stage 400x300, control 660x70 → 최대 x = 400-660-12 < 12 → 12로 클램프
    expect(clampFloatingPosition({ x: 1750, y: 900 }, 400, 300, 660, 70)).toEqual({
      x: 12,
      y: 12
    });
  });

  it("clamps to the max margin when the control fits", () => {
    expect(clampFloatingPosition({ x: 999, y: 999 }, 800, 500, 200, 70)).toEqual({
      x: 800 - 200 - 12,
      y: 500 - 70 - 12
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: FAIL — `clampFloatingPosition is not a function`.

- [ ] **Step 3: 구현**

`src/domain/workout.ts` 에 추가:

```ts
// 플로팅 컨트롤을 stage 안에 머무르게 한다. 최소 12px 마진, 최대는
// stage 에서 컨트롤 크기와 마진을 뺀 위치. 음수가 되면 12px 로 고정.
export const clampFloatingPosition = (
  pos: { x: number; y: number },
  stageWidth: number,
  stageHeight: number,
  controlWidth: number,
  controlHeight: number
): { x: number; y: number } => {
  const margin = 12;
  const maxX = Math.max(margin, stageWidth - controlWidth - margin);
  const maxY = Math.max(margin, stageHeight - controlHeight - margin);
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY)
  };
};
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/domain/workout.test.ts`
Expected: PASS.

- [ ] **Step 5: 드래그 클램프를 stage 기준으로 변경**

`src/App.tsx` import 에 `clampFloatingPosition` 추가. `handleDragStart` 의 `onMove` 를 교체. 컨트롤 요소는 드래그 핸들의 offsetParent(=floating-control)의 offsetParent(=stage)가 아니라, 드래그 핸들 자신의 부모 체인에서 stage 를 얻는다. 단순화를 위해 `event.currentTarget`(드래그 핸들 버튼)의 `closest(".video-stage")` 로 stage 를, `closest(".floating-control")` 로 컨트롤을 얻는다:

```tsx
  const handleDragStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = latestPositionRef.current;
    const handle = event.currentTarget;
    const control = handle.closest(".floating-control") as HTMLElement | null;
    const stage = handle.closest(".video-stage") as HTMLElement | null;
    handle.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const stageW = stage?.clientWidth ?? window.innerWidth;
      const stageH = stage?.clientHeight ?? window.innerHeight;
      const controlW = control?.offsetWidth ?? 160;
      const controlH = control?.offsetHeight ?? 70;
      const nextPosition = clampFloatingPosition(
        { x: origin.x + moveEvent.clientX - startX, y: origin.y + moveEvent.clientY - startY },
        stageW,
        stageH,
        controlW,
        controlH
      );
      latestPositionRef.current = nextPosition;
      setData((current) => ({
        ...current,
        settings: { ...current.settings, floatingControlPosition: nextPosition }
      }));
    };

    const onUp = () => {
      updateSettings({
        ...data.settings,
        floatingControlPosition: latestPositionRef.current
      });
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
```

- [ ] **Step 6: fullscreenchange/resize 재클램프 (WorkoutView → App 통지)**

`WorkoutView` 는 stage ref 를 가진다. 부모가 위치를 갱신할 수 있도록 새 prop 을 받는다.

`WorkoutViewProps` 에 추가:

```ts
  onClampFloating: (stageWidth: number, stageHeight: number, controlWidth: number, controlHeight: number) => void;
```

구조분해 인자에 `onClampFloating` 추가. 기존 전체화면 effect 아래에 stage 크기 변화 시 통지하는 effect 를 추가:

```tsx
  useEffect(() => {
    const stage = videoStageRef.current;
    if (!stage) {
      return;
    }
    const notify = () => {
      const control = stage.querySelector(".floating-control") as HTMLElement | null;
      onClampFloating(
        stage.clientWidth,
        stage.clientHeight,
        control?.offsetWidth ?? 160,
        control?.offsetHeight ?? 70
      );
    };
    document.addEventListener("fullscreenchange", notify);
    window.addEventListener("resize", notify);
    return () => {
      document.removeEventListener("fullscreenchange", notify);
      window.removeEventListener("resize", notify);
    };
  }, [onClampFloating]);
```

App 에 핸들러 추가(`handleResetTimerCount` 부근):

```tsx
  const handleClampFloating = useCallback(
    (stageWidth: number, stageHeight: number, controlWidth: number, controlHeight: number) => {
      setData((current) => {
        const clamped = clampFloatingPosition(
          current.settings.floatingControlPosition,
          stageWidth,
          stageHeight,
          controlWidth,
          controlHeight
        );
        const pos = current.settings.floatingControlPosition;
        if (clamped.x === pos.x && clamped.y === pos.y) {
          return current;
        }
        latestPositionRef.current = clamped;
        const settings = { ...current.settings, floatingControlPosition: clamped };
        void saveSettings(settings);
        return { ...current, settings };
      });
    },
    []
  );
```

`<WorkoutView>` 호출에 `onClampFloating={handleClampFloating}` 전달.

- [ ] **Step 7: 타입체크 + 테스트 + 브라우저 검증**

Run: `npx tsc --noEmit` (clean)
Run: `npx vitest run` (all pass)
브라우저: 운동 화면에서 앱 전체화면 진입 → 플로팅을 우측 하단으로 드래그 → 전체화면 해제 → 플로팅이 stage 안에 보이는지 확인. resize(뷰포트 축소) 후에도 보이는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/domain/workout.ts src/domain/workout.test.ts src/App.tsx src/views/WorkoutView.tsx
git commit -m "bug : 전체화면 해제 후 플로팅이 stage 밖으로 사라지는 문제 수정"
```

---

### Task 5a: seek/영상 ID 순수 함수 (TDD, 5번 — 분리 커밋)

**Files:**
- Modify: `src/domain/workout.ts`
- Test: `src/domain/workout.test.ts`
- Modify: `src/utils/youtube.ts`
- Create: `src/utils/youtube.test.ts`

- [ ] **Step 1: seekTarget 실패 테스트**

`src/domain/workout.test.ts` import 에 `seekTarget` 추가. 끝에:

```ts
describe("seekTarget", () => {
  it("moves forward and backward within bounds", () => {
    expect(seekTarget(30, 5, 100)).toBe(35);
    expect(seekTarget(30, -5, 100)).toBe(25);
  });

  it("clamps to start and end", () => {
    expect(seekTarget(2, -5, 100)).toBe(0);
    expect(seekTarget(98, 5, 100)).toBe(100);
  });
});
```

- [ ] **Step 2: toYoutubeVideoId 실패 테스트**

`src/utils/youtube.test.ts` 신규 생성:

```ts
import { describe, expect, it } from "vitest";
import { toYoutubeVideoId } from "./youtube";

describe("toYoutubeVideoId", () => {
  it("extracts id from watch url", () => {
    expect(toYoutubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
  });
  it("extracts id from youtu.be url", () => {
    expect(toYoutubeVideoId("https://youtu.be/xyz789")).toBe("xyz789");
  });
  it("extracts id from shorts and embed", () => {
    expect(toYoutubeVideoId("https://www.youtube.com/shorts/sh0rt")).toBe("sh0rt");
    expect(toYoutubeVideoId("https://www.youtube.com/embed/emb3d")).toBe("emb3d");
  });
  it("returns empty for invalid", () => {
    expect(toYoutubeVideoId("not a url")).toBe("");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/domain/workout.test.ts src/utils/youtube.test.ts`
Expected: FAIL — 두 함수 미정의.

- [ ] **Step 4: seekTarget 구현**

`src/domain/workout.ts` 에 추가:

```ts
// 현재 위치에서 delta 초 이동, [0, duration] 으로 클램프.
export const seekTarget = (current: number, delta: number, duration: number): number =>
  Math.min(Math.max(0, current + delta), duration);
```

- [ ] **Step 5: toYoutubeVideoId 구현**

`src/utils/youtube.ts` 에 추가(기존 `toYoutubeEmbedUrl` 파싱 재사용). `toYoutubeEmbedUrl` 을 다음과 같이 ID 추출 위에 재구성:

```ts
export const toYoutubeVideoId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) {
        return v;
      }
      const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts?.[1]) {
        return shorts[1];
      }
      const embed = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embed?.[1]) {
        return embed[1];
      }
    }
  } catch {
    return "";
  }
  return "";
};
```

그리고 기존 `toYoutubeEmbedUrl` 을 ID 기반으로 단순화:

```ts
export const toYoutubeEmbedUrl = (value: string) => {
  const id = toYoutubeVideoId(value);
  return id ? `https://www.youtube.com/embed/${id}` : "";
};
```

- [ ] **Step 6: 통과 확인 + 커밋**

Run: `npx vitest run` (all pass)
Run: `npx tsc --noEmit` (clean)

```bash
git add src/domain/workout.ts src/domain/workout.test.ts src/utils/youtube.ts src/utils/youtube.test.ts
git commit -m "feat : 영상 seek/ID 추출 순수 함수 추가"
```

---

### Task 5b: IFrame Player API + 단축키 (5번 — 분리 커밋)

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/views/WorkoutView.tsx`

- [ ] **Step 1: WorkoutView 를 IFrame Player API로 전환**

`src/views/WorkoutView.tsx` 에서 `<iframe>` 직접 렌더 대신 컨테이너 div 에 플레이어를 mount 한다. props 에 영상 ID 와 player 준비/명령 연결을 위한 ref 콜백을 받는다.

`WorkoutViewProps` 에 추가:

```ts
  videoId: string;
  onPlayerReady: (player: YTPlayerHandle) => void;
```

상단에 최소 타입과 전역 선언 추가(파일 상단 import 아래):

```ts
type YTPlayerHandle = {
  setVolume: (v: number) => void;
  getVolume: () => number;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  loadVideoById: (id: string) => void;
};

declare global {
  interface Window {
    YT?: {
      Player: new (el: HTMLElement, config: Record<string, unknown>) => YTPlayerHandle;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}
```

video-stage 내부의 `{embedUrl ? <iframe.../> : <placeholder/>}` 를 다음으로 교체:

```tsx
        {videoId ? (
          <div ref={playerHostRef} className="video-frame" />
        ) : (
          <div className="video-placeholder">
            <Activity size={48} aria-hidden="true" />
            <span>YouTube</span>
          </div>
        )}
```

플레이어 생성/영상 교체 effect 추가(컴포넌트 내부):

```tsx
  const playerHostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayerHandle | null>(null);

  useEffect(() => {
    if (!videoId) {
      return;
    }
    const ensureApi = () =>
      new Promise<void>((resolve) => {
        if (window.YT?.Player) {
          resolve();
          return;
        }
        const existing = document.getElementById("yt-iframe-api");
        if (!existing) {
          const script = document.createElement("script");
          script.id = "yt-iframe-api";
          script.src = "https://www.youtube.com/iframe_api";
          document.body.appendChild(script);
        }
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => {
          prev?.();
          resolve();
        };
      });

    let cancelled = false;
    void ensureApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT) {
        return;
      }
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        return;
      }
      const player = new window.YT.Player(playerHostRef.current, {
        videoId,
        playerVars: { enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            playerRef.current = player;
            onPlayerReady(player);
          }
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [videoId, onPlayerReady]);
```

(주의: `embedUrl` prop 은 더 이상 iframe 에 쓰지 않는다. App 에서 `videoId` 를 새로 전달한다. `embedUrl` prop 은 제거하거나 남겨둘 수 있으나, 미사용이면 제거해 깔끔히 한다.)

- [ ] **Step 2: App 에서 videoId 전달 + player ref 보관**

`src/App.tsx` import 에 `toYoutubeVideoId` 추가(utils/youtube). 기존 `embedUrl` 계산 부근에 추가:

```tsx
  const videoId = currentVideo ? toYoutubeVideoId(currentVideo.url) : "";
```

player handle ref 추가(다른 ref 부근):

```tsx
  const playerRef = useRef<import("./views/WorkoutView").YTPlayerHandle | null>(null);
  const handlePlayerReady = useCallback((player: import("./views/WorkoutView").YTPlayerHandle) => {
    playerRef.current = player;
  }, []);
```

(`YTPlayerHandle` 를 WorkoutView 에서 `export type` 으로 내보낸다.)

`<WorkoutView>` 호출에 `videoId={videoId}` 와 `onPlayerReady={handlePlayerReady}` 전달. 기존 `embedUrl` prop 은 WorkoutView 에서 제거했다면 함께 제거.

- [ ] **Step 3: 단축키 effect 확장**

`src/App.tsx` import 에 `seekTarget` 추가. 기존 `s` 단축키 effect 의 `onKeyDown` 을 교체해 F/방향키를 처리한다. 전체화면 토글은 stage 를 직접 제어한다(아래 헬퍼). WorkoutView 의 전체화면 로직과 중복을 피하기 위해, App 에서 stage 를 `document.querySelector(".video-stage")` 로 찾아 토글한다:

```tsx
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (isTyping) {
        return;
      }
      const key = event.key;
      const player = playerRef.current;
      if (key.toLowerCase() === "s") {
        event.preventDefault();
        handleSetComplete();
      } else if (key.toLowerCase() === "f") {
        event.preventDefault();
        const stage = document.querySelector(".video-stage") as HTMLElement | null;
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else {
          void stage?.requestFullscreen();
        }
      } else if (key === "ArrowUp" && player) {
        event.preventDefault();
        player.setVolume(clampVolume(player.getVolume() + 5));
      } else if (key === "ArrowDown" && player) {
        event.preventDefault();
        player.setVolume(clampVolume(player.getVolume() - 5));
      } else if (key === "ArrowRight" && player) {
        event.preventDefault();
        player.seekTo(seekTarget(player.getCurrentTime(), 5, player.getDuration()), true);
      } else if (key === "ArrowLeft" && player) {
        event.preventDefault();
        player.seekTo(seekTarget(player.getCurrentTime(), -5, player.getDuration()), true);
      }
    };
```

effect 의존성 배열에 `handleSetComplete` 외 추가 의존 없음(player 는 ref). 기존대로 `[data.settings.keyboardShortcutEnabled, handleSetComplete]` 유지.

- [ ] **Step 4: video-frame 스타일**

`src/styles.css` 의 video-stage iframe 규칙 근처에 `.video-frame`(과 그 내부 iframe)이 stage 를 채우도록 추가. 기존 iframe 규칙을 찾아 동일 크기 규칙을 `.video-frame iframe` 에도 적용:

```css
.video-frame,
.video-frame iframe {
  width: 100%;
  height: 100%;
  border: 0;
}
```

- [ ] **Step 5: 타입체크 + 테스트**

Run: `npx tsc --noEmit` (clean)
Run: `npx vitest run` (all pass)

- [ ] **Step 6: 브라우저 검증 (결정 게이트)**

`mcp__Claude_Preview__preview_start` 후 플레이리스트에 영상이 있는 상태에서:
- 영상이 IFrame Player 로 재생되는지(플레이어 로드).
- `F` 전체화면 토글, `↑/↓` 음량 변화(YT 플레이어 음량), `←/→` 5초 seek 동작.
- 콘솔 에러 확인.

**판단:** 동작이 만족스러우면 유지. 만족스럽지 않으면 Task 5a/5b 커밋을 `git revert` 또는 브랜치에서 제거하고 1~4번만 남긴다(아래 롤백 절차).

- [ ] **Step 7: 커밋**

```bash
git add src/App.tsx src/views/WorkoutView.tsx src/styles.css
git commit -m "feat : YouTube IFrame API 전환과 영상 키보드 단축키 추가"
```

---

## 5번 롤백 절차 (결정 게이트에서 "별로" 판정 시)

5a/5b 두 커밋만 되돌린다(1~4 유지):

```bash
git revert --no-edit <5b-sha> <5a-sha>
```

또는 아직 main 머지 전이면 해당 두 커밋을 `git rebase` 로 드롭한다. 되돌린
뒤 `npx vitest run` 과 `npx tsc --noEmit` 로 1~4 무결성 확인.

---

## Self-Review

- **Spec coverage:** 1(Task1) · 2(Task2) · 3(Task3) · 4(Task4) · 5 IFrame API+단축키(Task5a 순수함수, Task5b 통합) · 결정 게이트/롤백(Task5b Step6 + 롤백 절차) 매핑됨.
- **Placeholder scan:** 없음. 모든 코드 단계 실제 코드 포함.
- **Type consistency:** `TimerState`/`toggleTimer` 기존 일치. `timerCount:number`/`onResetTimerCount` Task2 정의 ↔ Task3 사용 일치. `clampFloatingPosition(pos,stageW,stageH,ctrlW,ctrlH)` Task4 정의 ↔ App/WorkoutView 호출 일치. `YTPlayerHandle` Task5b export ↔ App import 일치. `seekTarget(current,delta,duration)` Task5a ↔ Task5b 호출 일치. `toYoutubeVideoId` Task5a ↔ App/WorkoutView 사용 일치.
- **주의:** Task2 Step6에서 props 미사용 시 TS noUnusedParameters 경고 가능 → Task3에서 즉시 사용하므로 Task2+Task3를 연속 실행하거나, 경고가 빌드 실패를 유발하면 Task2 커밋을 Task3와 합쳐 진행한다.
