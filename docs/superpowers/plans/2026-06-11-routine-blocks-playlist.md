# 복합세트 · 블록 루틴 · 유튜브 플레이리스트 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운동 컴패니언을 통일 블록 모델(루틴 → 블록 → 종목)로 개편하고, 구간(세그먼트) 기반 복합세트 등록과 이름 붙인 유튜브 플레이리스트를 추가한다.

**Architecture:** 도메인(타입·진행 엔진·마이그레이션)을 먼저 TDD로 재작성하고, 뷰 컴포넌트를 `src/views/`로 분리해 새 모델 기반으로 새로 작성한 뒤, 마지막에 `App.tsx`를 교체한다. 스펙: `docs/superpowers/specs/2026-06-11-routine-blocks-playlist-design.md`

**Tech Stack:** React 19 + TypeScript + Vite, vitest, IndexedDB, lucide-react

**중요 — 빌드 상태:** Task 1에서 타입을 바꾸면 기존 `App.tsx`가 컴파일되지 않는다. Task 10에서 `App.tsx`를 교체할 때까지 `npm run build`는 실패해도 정상이다. 각 태스크의 검증은 `npm test`(vitest는 import된 파일만 변환하므로 영향 없음)로 한다.

---

## 파일 구조

| 파일 | 작업 | 책임 |
|---|---|---|
| `src/types.ts` | 재작성 | v2 타입 정의 |
| `src/domain/workout.ts` | 재작성 | 세그먼트 헬퍼 + 블록 진행 엔진 |
| `src/domain/workout.test.ts` | 재작성 | 엔진 규칙 검증 |
| `src/domain/migration.ts` | 신규 | v1 → v2 변환 |
| `src/domain/migration.test.ts` | 신규 | 마이그레이션 검증 |
| `src/utils/youtube.ts` | 수정 | 플레이리스트 순환 + oEmbed 제목 |
| `src/utils/youtube.test.ts` | 수정 | 순환 규칙 검증 |
| `src/storage/db.ts` | 수정 | playlists 스토어 + 로드 시 마이그레이션 |
| `src/views/ExerciseLibraryView.tsx` | 신규 | 세그먼트 방식 운동 등록 |
| `src/views/RoutineView.tsx` | 신규 | 블록 기반 루틴 편집 |
| `src/views/WorkoutView.tsx` | 신규 | 운동 진행 + 플레이리스트 툴바 |
| `src/views/PlaylistView.tsx` | 신규 | 플레이리스트 관리 탭 |
| `src/views/CalendarView.tsx` | 신규(이동) | 달력 (기존 코드 이동) |
| `src/views/SettingsView.tsx` | 신규(이동) | 설정 (기존 코드 이동) |
| `src/App.tsx` | 재작성 | 상태·핸들러·탭 조립 |
| `src/styles.css` | 수정 | 신규 UI 스타일 |

UI 컴포넌트 테스트는 작성하지 않는다(프로젝트에 testing-library 없음, 도메인 로직은 전부 `src/domain/`과 `src/utils/`에서 검증).

---

### Task 1: v2 타입 + 도메인 헬퍼 + 진행 엔진

**Files:**
- Modify: `src/types.ts` (전체 교체)
- Modify: `src/domain/workout.ts` (전체 교체)
- Test: `src/domain/workout.test.ts` (전체 교체)

- [ ] **Step 1: `src/types.ts` 전체 교체**

```ts
// 운동 루틴과 로컬 저장 데이터의 타입을 정의한다.
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type SegmentType = "normal" | "cluster";

// 한 운동 안에서 같은 설정으로 반복되는 세트 구간
export type SetSegment = {
  id: string;
  type: SegmentType;
  sets: number;
  weight: string;
  reps: number;              // normal 전용
  clusterReps: number[];     // cluster 전용, 예: [10, 8, 6]
  intraRestSeconds: number;  // cluster 전용, 안내 표시용
};

export type ExerciseItem = {
  id: string;
  name: string;
  segments: SetSegment[];
  restSeconds: number;       // 세트(라운드) 간 휴식
  createdAt: string;
  updatedAt: string;
};

export type BlockExerciseSnapshot = {
  id: string;
  sourceExerciseId: string;
  name: string;
  segments: SetSegment[];
  order: number;
};

// 루틴 → 블록 → 종목. 종목 1개짜리 블록 = 단독 운동
export type RoutineBlock = {
  id: string;
  exercises: BlockExerciseSnapshot[];
  rounds: number;
  restSeconds: number;       // 라운드 간 휴식
  order: number;
};

export type RoutinePreset = {
  id: string;
  name: string;
  isActive: boolean;
  days: Record<Weekday, RoutineBlock[]>;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutCompletion = {
  date: string;
  completed: boolean;
  routinePresetId: string;
  completedAt: string;
};

export type YoutubePlaylistItem = {
  id: string;
  url: string;
  label: string;             // oEmbed 제목, 실패 시 URL
};

export type YoutubePlaylist = {
  id: string;
  name: string;
  items: YoutubePlaylistItem[];
  createdAt: string;
  updatedAt: string;
};

export type FloatingControlPosition = {
  x: number;
  y: number;
};

export type AppSettings = {
  alarmVolume: number;
  restEndSoundEnabled: boolean;
  restEndVisualAlertEnabled: boolean;
  floatingControlPosition: FloatingControlPosition;
  keyboardShortcutEnabled: boolean;
};

export type WorkoutPhase = "ready" | "rest" | "complete";

export type WorkoutSessionState = {
  blockIndex: number;
  round: number;             // 1부터 시작
  exerciseIndex: number;     // 블록 안 종목 인덱스
  phase: WorkoutPhase;
  remainingRestSeconds: number;
};

export type AppData = {
  version: number;
  exercises: ExerciseItem[];
  routines: RoutinePreset[];
  completions: WorkoutCompletion[];
  playlists: YoutubePlaylist[];
  settings: AppSettings;
};
```

- [ ] **Step 2: 실패하는 테스트 작성 — `src/domain/workout.test.ts` 전체 교체**

```ts
// 운동 진행 도메인 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import type { ExerciseItem, RoutineBlock, RoutinePreset, SetSegment } from "../types";
import {
  advanceSet,
  createBlockExercise,
  createMultiBlock,
  createSingleBlock,
  emptyRoutineDays,
  finishRest,
  flattenPrescriptions,
  getRoutineForDate,
  initialWorkoutSession,
  parseClusterReps,
  prescriptionForRound,
  setActiveRoutine,
  totalSets
} from "./workout";

const normalSegment = (overrides: Partial<SetSegment> = {}): SetSegment => ({
  id: "segment-normal",
  type: "normal",
  sets: 3,
  weight: "25kg",
  reps: 12,
  clusterReps: [],
  intraRestSeconds: 0,
  ...overrides
});

const clusterSegment = (overrides: Partial<SetSegment> = {}): SetSegment => ({
  id: "segment-cluster",
  type: "cluster",
  sets: 2,
  weight: "20kg",
  reps: 0,
  clusterReps: [10, 8, 6],
  intraRestSeconds: 5,
  ...overrides
});

const exercise = (overrides: Partial<ExerciseItem> = {}): ExerciseItem => ({
  id: "exercise-1",
  name: "바벨 컬",
  segments: [normalSegment()],
  restSeconds: 60,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z",
  ...overrides
});

const routine = (overrides: Partial<RoutinePreset> = {}): RoutinePreset => ({
  id: "routine-1",
  name: "기본 루틴",
  isActive: false,
  days: emptyRoutineDays(),
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z",
  ...overrides
});

describe("segments", () => {
  it("flattens segments into per-set prescriptions in order", () => {
    const all = flattenPrescriptions([normalSegment(), clusterSegment()]);

    expect(all).toHaveLength(5);
    expect(all[0]).toEqual({ type: "normal", weight: "25kg", reps: 12 });
    expect(all[3]).toEqual({
      type: "cluster",
      weight: "20kg",
      clusterReps: [10, 8, 6],
      intraRestSeconds: 5
    });
  });

  it("maps a round to its prescription and repeats the last one beyond range", () => {
    const segments = [normalSegment(), clusterSegment()];

    expect(prescriptionForRound(segments, 1)?.type).toBe("normal");
    expect(prescriptionForRound(segments, 4)?.type).toBe("cluster");
    expect(prescriptionForRound(segments, 99)?.type).toBe("cluster");
    expect(prescriptionForRound([], 1)).toBeNull();
  });

  it("counts total sets across segments", () => {
    expect(totalSets([normalSegment(), clusterSegment()])).toBe(5);
  });

  it("parses cluster reps text and rejects bad input", () => {
    expect(parseClusterReps("10+8+6")).toEqual([10, 8, 6]);
    expect(parseClusterReps(" 10 + 8 ")).toEqual([10, 8]);
    expect(parseClusterReps("10+a")).toBeNull();
    expect(parseClusterReps("10+")).toBeNull();
    expect(parseClusterReps("")).toBeNull();
  });
});

describe("blocks", () => {
  it("creates a single block with rounds derived from total sets", () => {
    const block = createSingleBlock(exercise({ segments: [normalSegment(), clusterSegment()] }));

    expect(block.exercises).toHaveLength(1);
    expect(block.rounds).toBe(5);
    expect(block.restSeconds).toBe(60);
    expect(block.exercises[0].sourceExerciseId).toBe("exercise-1");
  });

  it("creates a multi block with explicit rounds and rest", () => {
    const first = createBlockExercise(exercise({ id: "exercise-1", name: "라잉 트라이셉스" }), 0);
    const second = createBlockExercise(exercise({ id: "exercise-2", name: "V업" }), 1);
    const block = createMultiBlock([first, second], 3, 30);

    expect(block.exercises.map((item) => item.name)).toEqual(["라잉 트라이셉스", "V업"]);
    expect(block.rounds).toBe(3);
    expect(block.restSeconds).toBe(30);
  });
});

describe("routine plan", () => {
  it("keeps only one active routine", () => {
    const routines = [
      routine({ id: "routine-1", isActive: true }),
      routine({ id: "routine-2", name: "회복 루틴" })
    ];

    const next = setActiveRoutine(routines, "routine-2");

    expect(next.find((item) => item.id === "routine-1")?.isActive).toBe(false);
    expect(next.find((item) => item.id === "routine-2")?.isActive).toBe(true);
  });

  it("loads blocks for the active routine weekday and skips empty blocks", () => {
    const block = createSingleBlock(exercise());
    const emptyBlock: RoutineBlock = {
      id: "block-empty",
      exercises: [],
      rounds: 1,
      restSeconds: 0,
      order: 1
    };
    const active = routine({
      isActive: true,
      days: { ...emptyRoutineDays(), thursday: [block, emptyBlock] }
    });

    const plan = getRoutineForDate([active], new Date("2026-06-11T12:00:00+09:00"));

    expect(plan.weekday).toBe("thursday");
    expect(plan.blocks).toHaveLength(1);
    expect(plan.blocks[0].exercises[0].name).toBe("바벨 컬");
  });
});

describe("workout session", () => {
  const multiBlock = () =>
    createMultiBlock(
      [
        createBlockExercise(exercise({ id: "exercise-1", name: "라잉 트라이셉스" }), 0),
        createBlockExercise(exercise({ id: "exercise-2", name: "V업" }), 1)
      ],
      2,
      30
    );

  it("moves to the next exercise in a block without rest", () => {
    const result = advanceSet(initialWorkoutSession(), [multiBlock()]);

    expect(result.state.phase).toBe("ready");
    expect(result.state.exerciseIndex).toBe(1);
    expect(result.state.round).toBe(1);
    expect(result.restSourceSeconds).toBe(0);
  });

  it("rests between rounds and resumes at the first exercise", () => {
    const blocks = [multiBlock()];
    const afterFirst = advanceSet(initialWorkoutSession(), blocks);
    const afterRound = advanceSet(afterFirst.state, blocks);

    expect(afterRound.state.phase).toBe("rest");
    expect(afterRound.state.remainingRestSeconds).toBe(30);
    expect(afterRound.state.round).toBe(2);
    expect(afterRound.state.exerciseIndex).toBe(0);

    const resumed = finishRest(afterRound.state);
    expect(resumed.phase).toBe("ready");
    expect(resumed.remainingRestSeconds).toBe(0);
  });

  it("rests between blocks using the finished block's rest", () => {
    const single = createSingleBlock(
      exercise({ segments: [normalSegment({ sets: 1 })], restSeconds: 90 })
    );
    const blocks = [single, createSingleBlock(exercise({ id: "exercise-2" }))];

    const result = advanceSet(initialWorkoutSession(), blocks);

    expect(result.state.phase).toBe("rest");
    expect(result.state.remainingRestSeconds).toBe(90);
    expect(result.state.blockIndex).toBe(1);
    expect(result.state.round).toBe(1);
    expect(result.state.exerciseIndex).toBe(0);
    expect(result.completedWorkout).toBe(false);
  });

  it("completes the workout after the last block's last round", () => {
    const single = createSingleBlock(exercise({ segments: [normalSegment({ sets: 1 })] }));

    const result = advanceSet(initialWorkoutSession(), [single]);

    expect(result.completedWorkout).toBe(true);
    expect(result.state.phase).toBe("complete");
  });

  it("ignores advance during rest or with no blocks", () => {
    const resting = { ...initialWorkoutSession(), phase: "rest" as const };
    expect(advanceSet(resting, [multiBlock()]).state).toEqual(resting);
    expect(advanceSet(initialWorkoutSession(), []).completedWorkout).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `flattenPrescriptions`, `createSingleBlock` 등 미정의 export

- [ ] **Step 4: `src/domain/workout.ts` 전체 교체**

```ts
// 운동 세그먼트 규칙과 블록 기반 세트 진행을 계산한다.
import type {
  AppSettings,
  BlockExerciseSnapshot,
  ExerciseItem,
  RoutineBlock,
  RoutinePreset,
  SetSegment,
  Weekday,
  WorkoutCompletion,
  WorkoutSessionState
} from "../types";

export const weekdays: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

export const weekdayLabels: Record<Weekday, string> = {
  monday: "월",
  tuesday: "화",
  wednesday: "수",
  thursday: "목",
  friday: "금",
  saturday: "토",
  sunday: "일"
};

export const emptyRoutineDays = (): Record<Weekday, RoutineBlock[]> => ({
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: []
});

export const defaultSettings: AppSettings = {
  alarmVolume: 70,
  restEndSoundEnabled: true,
  restEndVisualAlertEnabled: true,
  floatingControlPosition: { x: 24, y: 24 },
  keyboardShortcutEnabled: true
};

export const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const getTodayKey = (date = new Date()): Weekday => {
  const day = date.getDay();
  return weekdays[(day + 6) % 7];
};

export const toDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// --- 세그먼트 ---

export const createSegment = (partial: Partial<SetSegment> = {}): SetSegment => ({
  id: createId("segment"),
  type: "normal",
  sets: 3,
  weight: "",
  reps: 10,
  clusterReps: [],
  intraRestSeconds: 5,
  ...partial
});

export const totalSets = (segments: SetSegment[]) =>
  segments.reduce((sum, segment) => sum + segment.sets, 0);

export type SetPrescription =
  | { type: "normal"; weight: string; reps: number }
  | { type: "cluster"; weight: string; clusterReps: number[]; intraRestSeconds: number };

export const flattenPrescriptions = (segments: SetSegment[]): SetPrescription[] =>
  segments.flatMap((segment) =>
    Array.from({ length: segment.sets }, (): SetPrescription =>
      segment.type === "normal"
        ? { type: "normal", weight: segment.weight, reps: segment.reps }
        : {
            type: "cluster",
            weight: segment.weight,
            clusterReps: [...segment.clusterReps],
            intraRestSeconds: segment.intraRestSeconds
          }
    )
  );

// 라운드가 등록 세트 수를 넘으면 마지막 처방을 반복한다.
export const prescriptionForRound = (segments: SetSegment[], round: number) => {
  const all = flattenPrescriptions(segments);
  if (all.length === 0) {
    return null;
  }
  return all[Math.min(Math.max(1, round), all.length) - 1];
};

export const describePrescription = (prescription: SetPrescription) =>
  prescription.type === "normal"
    ? `${prescription.weight || "무게 미입력"} × ${prescription.reps}회`
    : `${prescription.clusterReps.join(" + ")}회 · 중간휴식 ${prescription.intraRestSeconds}초`;

export const describeSegments = (segments: SetSegment[]) =>
  segments
    .map((segment) =>
      segment.type === "normal"
        ? `일반 ${segment.weight || "무게 미입력"}×${segment.reps}회 ×${segment.sets}세트`
        : `클러스터 ${segment.clusterReps.join("+")}회 ×${segment.sets}세트`
    )
    .join(" · ");

export const parseClusterReps = (value: string): number[] | null => {
  const parts = value.split("+").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => !/^[0-9]+$/.test(part) || Number(part) < 1)) {
    return null;
  }
  return parts.map(Number);
};

// --- 블록 ---

export const createBlockExercise = (
  exercise: ExerciseItem,
  order: number
): BlockExerciseSnapshot => ({
  id: createId("block-exercise"),
  sourceExerciseId: exercise.id,
  name: exercise.name,
  segments: exercise.segments.map((segment) => ({
    ...segment,
    clusterReps: [...segment.clusterReps]
  })),
  order
});

export const createSingleBlock = (exercise: ExerciseItem): RoutineBlock => ({
  id: createId("block"),
  exercises: [createBlockExercise(exercise, 0)],
  rounds: Math.max(1, totalSets(exercise.segments)),
  restSeconds: exercise.restSeconds,
  order: 0
});

export const createMultiBlock = (
  exercises: BlockExerciseSnapshot[],
  rounds: number,
  restSeconds: number
): RoutineBlock => ({
  id: createId("block"),
  exercises: exercises.map((exercise, index) => ({ ...exercise, order: index })),
  rounds: Math.max(1, rounds),
  restSeconds: Math.max(0, restSeconds),
  order: 0
});

// --- 루틴 ---

export const setActiveRoutine = (
  routines: RoutinePreset[],
  routineId: string
): RoutinePreset[] =>
  routines.map((routine) => ({
    ...routine,
    isActive: routine.id === routineId,
    updatedAt: new Date().toISOString()
  }));

export const getActiveRoutine = (routines: RoutinePreset[]) =>
  routines.find((routine) => routine.isActive) ?? null;

export const getRoutineForDate = (routines: RoutinePreset[], date = new Date()) => {
  const routine = getActiveRoutine(routines);
  const weekday = getTodayKey(date);
  if (!routine) {
    return { routine: null, weekday, blocks: [] as RoutineBlock[] };
  }

  return {
    routine,
    weekday,
    blocks: [...routine.days[weekday]]
      .sort((a, b) => a.order - b.order)
      .filter((block) => block.exercises.length > 0)
      .map((block) => ({
        ...block,
        exercises: [...block.exercises].sort((a, b) => a.order - b.order)
      }))
  };
};

// --- 진행 엔진 ---

export const initialWorkoutSession = (): WorkoutSessionState => ({
  blockIndex: 0,
  round: 1,
  exerciseIndex: 0,
  phase: "ready",
  remainingRestSeconds: 0
});

export type AdvanceResult = {
  state: WorkoutSessionState;
  completedWorkout: boolean;
  restSourceSeconds: number;
};

export const advanceSet = (
  state: WorkoutSessionState,
  blocks: RoutineBlock[]
): AdvanceResult => {
  const block = blocks[state.blockIndex];
  if (!block || state.phase !== "ready") {
    return { state, completedWorkout: state.phase === "complete", restSourceSeconds: 0 };
  }

  // 1. 블록 안 다음 종목으로 — 휴식 없음
  if (state.exerciseIndex < block.exercises.length - 1) {
    return {
      state: { ...state, exerciseIndex: state.exerciseIndex + 1 },
      completedWorkout: false,
      restSourceSeconds: 0
    };
  }

  // 2. 라운드 종료, 다음 라운드 남음 — 라운드 휴식
  if (state.round < block.rounds) {
    return {
      state: {
        ...state,
        round: state.round + 1,
        exerciseIndex: 0,
        phase: "rest",
        remainingRestSeconds: block.restSeconds
      },
      completedWorkout: false,
      restSourceSeconds: block.restSeconds
    };
  }

  // 3. 마지막 블록 종료 — 운동 완료
  if (state.blockIndex >= blocks.length - 1) {
    return {
      state: { ...state, phase: "complete", remainingRestSeconds: 0 },
      completedWorkout: true,
      restSourceSeconds: 0
    };
  }

  // 4. 다음 블록으로 — 끝난 블록의 휴식 적용
  return {
    state: {
      blockIndex: state.blockIndex + 1,
      round: 1,
      exerciseIndex: 0,
      phase: "rest",
      remainingRestSeconds: block.restSeconds
    },
    completedWorkout: false,
    restSourceSeconds: block.restSeconds
  };
};

export const finishRest = (state: WorkoutSessionState): WorkoutSessionState => {
  if (state.phase !== "rest") {
    return state;
  }

  return {
    ...state,
    phase: "ready",
    remainingRestSeconds: 0
  };
};

export const createCompletion = (
  routinePresetId: string,
  date = new Date()
): WorkoutCompletion => ({
  date: toDateKey(date),
  completed: true,
  routinePresetId,
  completedAt: date.toISOString()
});

export const formatSeconds = (seconds: number) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${`${remainder}`.padStart(2, "0")}`;
};

export const clampVolume = (volume: number) => Math.min(100, Math.max(0, volume));
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test`
Expected: `workout.test.ts` 전체 PASS (`youtube.test.ts`도 기존 그대로 PASS)

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/domain/workout.ts src/domain/workout.test.ts
git commit -m "feat: rebuild domain around segments and routine blocks"
```

---

### Task 2: v1 → v2 마이그레이션 모듈

**Files:**
- Create: `src/domain/migration.ts`
- Test: `src/domain/migration.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성 — `src/domain/migration.test.ts`**

```ts
// v1 → v2 데이터 변환을 검증한다.
import { describe, expect, it } from "vitest";
import type { ExerciseItem, RoutinePreset } from "../types";
import { emptyRoutineDays } from "./workout";
import { migrateExercise, migrateRoutine, needsMigration } from "./migration";

const legacyExercise = {
  id: "exercise-1",
  name: "벤치프레스",
  weight: "60kg",
  targetReps: 5,
  sets: 2,
  restSeconds: 90,
  createdAt: "2026-06-11T00:00:00.000Z",
  updatedAt: "2026-06-11T00:00:00.000Z"
};

const legacySnapshot = {
  id: "snapshot-1",
  sourceExerciseId: "exercise-1",
  name: "벤치프레스",
  weight: "60kg",
  targetReps: 5,
  sets: 2,
  restSeconds: 90,
  order: 0
};

describe("migration", () => {
  it("converts a legacy exercise into one normal segment", () => {
    const migrated = migrateExercise(legacyExercise);

    expect(migrated.segments).toHaveLength(1);
    expect(migrated.segments[0]).toMatchObject({
      type: "normal",
      sets: 2,
      weight: "60kg",
      reps: 5
    });
    expect(migrated.restSeconds).toBe(90);
  });

  it("returns a v2 exercise unchanged", () => {
    const v2: ExerciseItem = migrateExercise(legacyExercise);
    expect(migrateExercise(v2)).toBe(v2);
  });

  it("converts legacy snapshots into single-exercise blocks", () => {
    const legacyRoutine = {
      id: "routine-1",
      name: "기본 루틴",
      isActive: true,
      days: { ...emptyRoutineDays(), monday: [legacySnapshot] },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    } as unknown as RoutinePreset;

    const migrated = migrateRoutine(legacyRoutine);
    const block = migrated.days.monday[0];

    expect(block.exercises).toHaveLength(1);
    expect(block.exercises[0].name).toBe("벤치프레스");
    expect(block.exercises[0].segments[0]).toMatchObject({ type: "normal", sets: 2, reps: 5 });
    expect(block.rounds).toBe(2);
    expect(block.restSeconds).toBe(90);
    expect(block.order).toBe(0);
  });

  it("detects when migration is needed", () => {
    const v2 = migrateExercise(legacyExercise);

    expect(needsMigration([legacyExercise], [])).toBe(true);
    expect(needsMigration([v2], [])).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `./migration` 모듈 없음

- [ ] **Step 3: `src/domain/migration.ts` 작성**

```ts
// 구버전(v1) 저장 데이터를 v2 블록 구조로 변환한다.
import type {
  ExerciseItem,
  RoutineBlock,
  RoutinePreset,
  SetSegment,
  Weekday
} from "../types";
import { createId } from "./workout";

export const CURRENT_DATA_VERSION = 2;

type LegacyExercise = {
  id: string;
  name: string;
  weight: string;
  targetReps: number;
  sets: number;
  restSeconds: number;
  createdAt: string;
  updatedAt: string;
};

type LegacySnapshot = {
  id: string;
  sourceExerciseId: string;
  name: string;
  weight: string;
  targetReps: number;
  sets: number;
  restSeconds: number;
  order: number;
};

type LegacyRoutine = Omit<RoutinePreset, "days"> & {
  days: Record<Weekday, Array<LegacySnapshot | RoutineBlock>>;
};

const legacySegment = (weight: string, reps: number, sets: number): SetSegment => ({
  id: createId("segment"),
  type: "normal",
  sets: Math.max(1, sets),
  weight,
  reps: Math.max(1, reps),
  clusterReps: [],
  intraRestSeconds: 0
});

export const migrateExercise = (exercise: ExerciseItem | LegacyExercise): ExerciseItem => {
  if ("segments" in exercise) {
    return exercise;
  }

  return {
    id: exercise.id,
    name: exercise.name,
    segments: [legacySegment(exercise.weight, exercise.targetReps, exercise.sets)],
    restSeconds: exercise.restSeconds,
    createdAt: exercise.createdAt,
    updatedAt: exercise.updatedAt
  };
};

const migrateDayEntry = (entry: LegacySnapshot | RoutineBlock): RoutineBlock => {
  if ("exercises" in entry) {
    return entry;
  }

  return {
    id: createId("block"),
    exercises: [
      {
        id: entry.id,
        sourceExerciseId: entry.sourceExerciseId,
        name: entry.name,
        segments: [legacySegment(entry.weight, entry.targetReps, entry.sets)],
        order: 0
      }
    ],
    rounds: Math.max(1, entry.sets),
    restSeconds: entry.restSeconds,
    order: entry.order
  };
};

export const migrateRoutine = (routine: RoutinePreset | LegacyRoutine): RoutinePreset => ({
  ...routine,
  days: Object.fromEntries(
    Object.entries(routine.days).map(([day, entries]) => [day, entries.map(migrateDayEntry)])
  ) as RoutinePreset["days"]
});

export const needsMigration = (
  exercises: Array<ExerciseItem | LegacyExercise>,
  routines: Array<RoutinePreset | LegacyRoutine>
) =>
  exercises.some((exercise) => !("segments" in exercise)) ||
  routines.some((routine) =>
    Object.values(routine.days).some((entries) =>
      entries.some((entry) => !("exercises" in entry))
    )
  );
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/migration.ts src/domain/migration.test.ts
git commit -m "feat: add v1 to v2 data migration"
```

---

### Task 3: 유튜브 플레이리스트 헬퍼

**Files:**
- Modify: `src/utils/youtube.ts` (함수 추가)
- Test: `src/utils/youtube.test.ts` (테스트 추가)

- [ ] **Step 1: 실패하는 테스트 추가 — `src/utils/youtube.test.ts` 끝에 추가**

```ts
import { afterEach, vi } from "vitest";
import { fetchYoutubeTitle, nextPlaylistIndex, previousPlaylistIndex } from "./youtube";

describe("playlist navigation", () => {
  it("cycles forward and wraps to the first item", () => {
    expect(nextPlaylistIndex(3, 0)).toBe(1);
    expect(nextPlaylistIndex(3, 2)).toBe(0);
    expect(nextPlaylistIndex(0, 0)).toBe(0);
  });

  it("cycles backward and wraps to the last item", () => {
    expect(previousPlaylistIndex(3, 0)).toBe(2);
    expect(previousPlaylistIndex(3, 2)).toBe(1);
    expect(previousPlaylistIndex(0, 0)).toBe(0);
  });
});

describe("fetchYoutubeTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the oEmbed title on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: "운동 음악 1시간" })
      })
    );

    await expect(fetchYoutubeTitle("https://youtu.be/abc123")).resolves.toBe("운동 음악 1시간");
  });

  it("falls back to the url on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(fetchYoutubeTitle("https://youtu.be/abc123")).resolves.toBe(
      "https://youtu.be/abc123"
    );
  });
});
```

(기존 import 줄은 `import { describe, expect, it } from "vitest";` → `import { afterEach, describe, expect, it, vi } from "vitest";`로 합치고, 함수 import도 기존 줄에 합친다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test`
Expected: FAIL — `nextPlaylistIndex` 등 미정의

- [ ] **Step 3: `src/utils/youtube.ts` 끝에 추가**

```ts
export const nextPlaylistIndex = (length: number, current: number) =>
  length <= 0 ? 0 : (current + 1) % length;

export const previousPlaylistIndex = (length: number, current: number) =>
  length <= 0 ? 0 : (current - 1 + length) % length;

// 제목 취득 실패(오프라인 등) 시 URL을 그대로 라벨로 쓴다.
export const fetchYoutubeTitle = async (url: string): Promise<string> => {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!response.ok) {
      return url;
    }
    const data = (await response.json()) as { title?: string };
    return data.title?.trim() || url;
  } catch {
    return url;
  }
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/youtube.ts src/utils/youtube.test.ts
git commit -m "feat: add playlist cycling and oEmbed title fetch"
```

---

### Task 4: 스토리지 v2 (playlists 스토어 + 로드 시 마이그레이션)

**Files:**
- Modify: `src/storage/db.ts`

- [ ] **Step 1: `src/storage/db.ts` 전체 교체**

```ts
// IndexedDB에 운동 앱 데이터를 저장하고 불러온다.
import type {
  AppData,
  AppSettings,
  ExerciseItem,
  RoutinePreset,
  WorkoutCompletion,
  YoutubePlaylist
} from "../types";
import { defaultSettings } from "../domain/workout";
import {
  CURRENT_DATA_VERSION,
  migrateExercise,
  migrateRoutine,
  needsMigration
} from "../domain/migration";

const DB_NAME = "collector-workout-companion";
const DB_VERSION = 2;

const stores = {
  exercises: "exercises",
  routines: "routines",
  completions: "completions",
  playlists: "playlists",
  settings: "settings"
} as const;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(stores).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const txStore = (
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode = "readonly"
) => db.transaction(storeName, mode).objectStore(storeName);

const getAll = async <T>(storeName: string): Promise<T[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = txStore(db, storeName).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result as T[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const getOne = async <T>(storeName: string, key: string): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = txStore(db, storeName).get(key);
    request.onsuccess = () => {
      db.close();
      resolve(request.result as T | undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const putAll = async <T>(storeName: string, values: T[]) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const putOne = async <T>(storeName: string, value: T) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = txStore(db, storeName, "readwrite").put(value);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

export const loadAppData = async (): Promise<AppData> => {
  const [rawExercises, rawRoutines, completions, playlists, storedSettings] = await Promise.all([
    getAll<ExerciseItem>(stores.exercises),
    getAll<RoutinePreset>(stores.routines),
    getAll<WorkoutCompletion>(stores.completions),
    getAll<YoutubePlaylist>(stores.playlists),
    getOne<AppSettings & { id: string }>(stores.settings, "app-settings")
  ]);

  const exercises = rawExercises.map(migrateExercise);
  const routines = rawRoutines.map(migrateRoutine);

  // v1 데이터는 변환 결과를 즉시 저장해 다음 로드부터 v2로 읽는다.
  if (needsMigration(rawExercises, rawRoutines)) {
    await Promise.all([
      putAll(stores.exercises, exercises),
      putAll(stores.routines, routines)
    ]);
  }

  const settings = storedSettings
    ? {
        alarmVolume: storedSettings.alarmVolume,
        restEndSoundEnabled: storedSettings.restEndSoundEnabled,
        restEndVisualAlertEnabled: storedSettings.restEndVisualAlertEnabled,
        floatingControlPosition: storedSettings.floatingControlPosition,
        keyboardShortcutEnabled: storedSettings.keyboardShortcutEnabled
      }
    : defaultSettings;

  return {
    version: CURRENT_DATA_VERSION,
    exercises,
    routines,
    completions,
    playlists,
    settings
  };
};

export const saveExercises = (exercises: ExerciseItem[]) =>
  putAll(stores.exercises, exercises);

export const saveRoutines = (routines: RoutinePreset[]) => putAll(stores.routines, routines);

export const saveCompletions = (completions: WorkoutCompletion[]) =>
  putAll(stores.completions, completions);

export const savePlaylists = (playlists: YoutubePlaylist[]) =>
  putAll(stores.playlists, playlists);

export const saveSettings = (settings: AppSettings) =>
  putOne(stores.settings, { id: "app-settings", ...settings });
```

- [ ] **Step 2: 테스트 회귀 확인**

Run: `npm test`
Expected: PASS (db.ts는 테스트에서 import되지 않음 — 컴파일 오류 없는지만 `npx tsc --noEmit src/storage/db.ts` 대신 Task 11 빌드에서 최종 확인)

- [ ] **Step 3: Commit**

```bash
git add src/storage/db.ts
git commit -m "feat: add playlists store and migrate v1 data on load"
```

---

### Task 5: ExerciseLibraryView (세그먼트 방식 운동 등록)

**Files:**
- Create: `src/views/ExerciseLibraryView.tsx`

- [ ] **Step 1: `src/views/ExerciseLibraryView.tsx` 작성**

```tsx
// 운동 등록/수정 화면. 구간(세그먼트) 방식으로 세트를 구성한다.
import { Plus, Save, Trash2 } from "lucide-react";
import type { ExerciseItem, SegmentType } from "../types";
import { createId, describeSegments, formatSeconds } from "../domain/workout";

export type SegmentForm = {
  id: string;
  type: SegmentType;
  sets: string;
  weight: string;
  reps: string;
  clusterReps: string;       // "10+8+6"
  intraRestSeconds: string;
};

export type ExerciseForm = {
  name: string;
  restSeconds: string;
  segments: SegmentForm[];
};

export const emptySegmentForm = (): SegmentForm => ({
  id: createId("segment"),
  type: "normal",
  sets: "3",
  weight: "",
  reps: "10",
  clusterReps: "10+8+6",
  intraRestSeconds: "5"
});

export const emptyExerciseForm = (): ExerciseForm => ({
  name: "",
  restSeconds: "90",
  segments: [emptySegmentForm()]
});

type ExerciseLibraryProps = {
  exercises: ExerciseItem[];
  form: ExerciseForm;
  editingExerciseId: string | null;
  formError: string;
  onFormChange: (form: ExerciseForm) => void;
  onSave: () => void;
  onEdit: (exercise: ExerciseItem) => void;
  onDelete: (exerciseId: string) => void;
  onCancelEdit: () => void;
};

function ExerciseLibraryView({
  exercises,
  form,
  editingExerciseId,
  formError,
  onFormChange,
  onSave,
  onEdit,
  onDelete,
  onCancelEdit
}: ExerciseLibraryProps) {
  const updateSegment = (segmentId: string, patch: Partial<SegmentForm>) => {
    onFormChange({
      ...form,
      segments: form.segments.map((segment) =>
        segment.id === segmentId ? { ...segment, ...patch } : segment
      )
    });
  };

  const removeSegment = (segmentId: string) => {
    onFormChange({
      ...form,
      segments: form.segments.filter((segment) => segment.id !== segmentId)
    });
  };

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Library</p>
          <h2>운동 목록</h2>
        </div>
      </div>

      <div className="editor-grid">
        <div className="panel">
          <h3>{editingExerciseId ? "운동 수정" : "운동 추가"}</h3>
          <div className="form-grid">
            <label>
              운동명
              <input
                value={form.name}
                onChange={(event) => onFormChange({ ...form, name: event.target.value })}
              />
            </label>
            <label>
              세트 간 휴식(초)
              <input
                type="number"
                min="0"
                value={form.restSeconds}
                onChange={(event) => onFormChange({ ...form, restSeconds: event.target.value })}
              />
            </label>
          </div>

          {form.segments.map((segment, index) => (
            <div className="segment-card" key={segment.id}>
              <div className="segment-head">
                <span className="label">구간 {index + 1}</span>
                <select
                  aria-label="구간 타입"
                  value={segment.type}
                  onChange={(event) =>
                    updateSegment(segment.id, { type: event.target.value as SegmentType })
                  }
                >
                  <option value="normal">일반</option>
                  <option value="cluster">복합(클러스터)</option>
                </select>
                {form.segments.length > 1 && (
                  <button
                    type="button"
                    className="icon-button danger"
                    onClick={() => removeSegment(segment.id)}
                    title="구간 삭제"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="form-grid">
                <label>
                  세트 수
                  <input
                    type="number"
                    min="1"
                    value={segment.sets}
                    onChange={(event) => updateSegment(segment.id, { sets: event.target.value })}
                  />
                </label>
                <label>
                  무게
                  <input
                    value={segment.weight}
                    placeholder="25kg"
                    onChange={(event) => updateSegment(segment.id, { weight: event.target.value })}
                  />
                </label>
                {segment.type === "normal" ? (
                  <label>
                    횟수
                    <input
                      type="number"
                      min="1"
                      value={segment.reps}
                      onChange={(event) => updateSegment(segment.id, { reps: event.target.value })}
                    />
                  </label>
                ) : (
                  <>
                    <label>
                      횟수 패턴
                      <input
                        value={segment.clusterReps}
                        placeholder="10+8+6"
                        onChange={(event) =>
                          updateSegment(segment.id, { clusterReps: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      중간휴식(초)
                      <input
                        type="number"
                        min="0"
                        value={segment.intraRestSeconds}
                        onChange={(event) =>
                          updateSegment(segment.id, { intraRestSeconds: event.target.value })
                        }
                      />
                    </label>
                  </>
                )}
              </div>
            </div>
          ))}

          <button
            type="button"
            className="ghost-button"
            onClick={() =>
              onFormChange({ ...form, segments: [...form.segments, emptySegmentForm()] })
            }
          >
            <Plus size={15} aria-hidden="true" />
            구간 추가
          </button>

          {formError && <p className="error-text">{formError}</p>}

          <div className="button-row">
            <button className="command-button" type="button" onClick={onSave}>
              <Save size={17} aria-hidden="true" />
              저장
            </button>
            {editingExerciseId && (
              <button className="ghost-button" type="button" onClick={onCancelEdit}>
                취소
              </button>
            )}
          </div>
        </div>

        <div className="panel">
          <h3>목록</h3>
          <div className="item-list">
            {exercises.length === 0 ? (
              <p className="empty-state">운동 없음</p>
            ) : (
              exercises.map((exercise) => (
                <div className="list-item" key={exercise.id}>
                  <div>
                    <strong>{exercise.name}</strong>
                    <span>
                      {describeSegments(exercise.segments)} · 휴식{" "}
                      {formatSeconds(exercise.restSeconds)}
                    </span>
                  </div>
                  <div className="item-actions">
                    <button type="button" className="ghost-button" onClick={() => onEdit(exercise)}>
                      수정
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => onDelete(exercise.id)}
                      title="삭제"
                    >
                      <Trash2 size={17} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ExerciseLibraryView;
```

- [ ] **Step 2: Commit**

```bash
git add src/views/ExerciseLibraryView.tsx
git commit -m "feat: add segment-based exercise library view"
```

---

### Task 6: RoutineView (블록 기반 루틴 편집)

**Files:**
- Create: `src/views/RoutineView.tsx`

블록 순서/종목 순서 변경은 ↑↓ 버튼으로 구현한다(드래그는 후속 개선).

- [ ] **Step 1: `src/views/RoutineView.tsx` 작성**

```tsx
// 루틴 프리셋과 요일별 블록 구성을 편집한다.
import { ArrowDown, ArrowUp, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
  BlockExerciseSnapshot,
  ExerciseItem,
  RoutineBlock,
  RoutinePreset,
  Weekday
} from "../types";
import {
  createBlockExercise,
  createMultiBlock,
  describeSegments,
  formatSeconds,
  weekdayLabels,
  weekdays
} from "../domain/workout";

type BlockDraft = {
  blockId: string | null;
  blockOrder: number;
  exercises: BlockExerciseSnapshot[];
  rounds: string;
  restSeconds: string;
};

type RoutineViewProps = {
  routines: RoutinePreset[];
  exercises: ExerciseItem[];
  selectedRoutine: RoutinePreset | null;
  selectedRoutineId: string;
  selectedDay: Weekday;
  routineName: string;
  onRoutineNameChange: (value: string) => void;
  onCreateRoutine: () => void;
  onSelectRoutine: (routineId: string) => void;
  onActivateRoutine: (routineId: string) => void;
  onSelectedDayChange: (day: Weekday) => void;
  onAddSingleBlock: (exerciseId: string) => void;
  onSaveBlock: (block: RoutineBlock) => void;
  onRemoveBlock: (blockId: string) => void;
  onMoveBlock: (blockId: string, direction: -1 | 1) => void;
};

function RoutineView({
  routines,
  exercises,
  selectedRoutine,
  selectedRoutineId,
  selectedDay,
  routineName,
  onRoutineNameChange,
  onCreateRoutine,
  onSelectRoutine,
  onActivateRoutine,
  onSelectedDayChange,
  onAddSingleBlock,
  onSaveBlock,
  onRemoveBlock,
  onMoveBlock
}: RoutineViewProps) {
  const [draft, setDraft] = useState<BlockDraft | null>(null);

  const dayBlocks = selectedRoutine
    ? [...selectedRoutine.days[selectedDay]].sort((a, b) => a.order - b.order)
    : [];

  const startNewDraft = () =>
    setDraft({ blockId: null, blockOrder: 0, exercises: [], rounds: "3", restSeconds: "30" });

  const startEditDraft = (block: RoutineBlock) =>
    setDraft({
      blockId: block.id,
      blockOrder: block.order,
      exercises: block.exercises.map((item) => ({
        ...item,
        segments: item.segments.map((segment) => ({
          ...segment,
          clusterReps: [...segment.clusterReps]
        }))
      })),
      rounds: String(block.rounds),
      restSeconds: String(block.restSeconds)
    });

  const addDraftExercise = (exerciseId: string) => {
    const exercise = exercises.find((item) => item.id === exerciseId);
    if (!exercise || !draft) {
      return;
    }
    setDraft({
      ...draft,
      exercises: [...draft.exercises, createBlockExercise(exercise, draft.exercises.length)]
    });
  };

  const removeDraftExercise = (snapshotId: string) => {
    if (!draft) {
      return;
    }
    setDraft({
      ...draft,
      exercises: draft.exercises
        .filter((item) => item.id !== snapshotId)
        .map((item, index) => ({ ...item, order: index }))
    });
  };

  const moveDraftExercise = (snapshotId: string, direction: -1 | 1) => {
    if (!draft) {
      return;
    }
    const index = draft.exercises.findIndex((item) => item.id === snapshotId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= draft.exercises.length) {
      return;
    }
    const next = [...draft.exercises];
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({
      ...draft,
      exercises: next.map((item, order) => ({ ...item, order }))
    });
  };

  const saveDraft = () => {
    if (!draft || draft.exercises.length === 0) {
      return;
    }
    const block = createMultiBlock(
      draft.exercises,
      Math.max(1, Number(draft.rounds) || 1),
      Math.max(0, Number(draft.restSeconds) || 0)
    );
    onSaveBlock(
      draft.blockId ? { ...block, id: draft.blockId, order: draft.blockOrder } : block
    );
    setDraft(null);
  };

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preset</p>
          <h2>루틴</h2>
        </div>
      </div>

      <div className="routine-layout">
        <div className="panel">
          <h3>루틴 그룹</h3>
          <div className="inline-form">
            <input
              value={routineName}
              onChange={(event) => onRoutineNameChange(event.target.value)}
              placeholder="루틴 이름"
            />
            <button className="command-button" type="button" onClick={onCreateRoutine}>
              <Plus size={17} aria-hidden="true" />
              추가
            </button>
          </div>

          <div className="item-list compact">
            {routines.map((routine) => (
              <button
                key={routine.id}
                type="button"
                className={`routine-choice ${selectedRoutineId === routine.id ? "active" : ""}`}
                onClick={() => onSelectRoutine(routine.id)}
              >
                <span>{routine.name}</span>
                {routine.isActive && <em>활성</em>}
              </button>
            ))}
          </div>

          {selectedRoutine && !selectedRoutine.isActive && (
            <button
              className="command-button wide"
              type="button"
              onClick={() => onActivateRoutine(selectedRoutine.id)}
            >
              <CheckCircle2 size={17} aria-hidden="true" />
              활성화
            </button>
          )}
        </div>

        <div className="panel routine-editor">
          <div className="weekday-tabs" role="tablist" aria-label="요일">
            {weekdays.map((day) => (
              <button
                key={day}
                type="button"
                className={selectedDay === day ? "active" : ""}
                onClick={() => onSelectedDayChange(day)}
              >
                {weekdayLabels[day]}
              </button>
            ))}
          </div>

          {selectedRoutine ? (
            <>
              <div className="inline-form">
                <select
                  aria-label="운동 선택"
                  onChange={(event) => {
                    if (event.target.value) {
                      onAddSingleBlock(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  defaultValue=""
                >
                  <option value="">운동 추가 (단독)</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name} · {describeSegments(exercise.segments)}
                    </option>
                  ))}
                </select>
                <button className="ghost-button" type="button" onClick={startNewDraft}>
                  <Plus size={15} aria-hidden="true" />
                  묶음 블록 추가
                </button>
              </div>

              {draft && (
                <div className="block-draft panel-inset">
                  <h4>{draft.blockId ? "블록 수정" : "묶음 블록 만들기"}</h4>
                  <div className="inline-form">
                    <select
                      aria-label="블록에 종목 추가"
                      onChange={(event) => {
                        if (event.target.value) {
                          addDraftExercise(event.target.value);
                          event.target.value = "";
                        }
                      }}
                      defaultValue=""
                    >
                      <option value="">종목 추가</option>
                      {exercises.map((exercise) => (
                        <option key={exercise.id} value={exercise.id}>
                          {exercise.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="item-list compact">
                    {draft.exercises.length === 0 ? (
                      <p className="empty-state">종목을 추가해 주세요</p>
                    ) : (
                      draft.exercises.map((item, index) => (
                        <div className="list-item" key={item.id}>
                          <span className="order-badge">{index + 1}</span>
                          <div>
                            <strong>{item.name}</strong>
                            <span>{describeSegments(item.segments)}</span>
                          </div>
                          <div className="item-actions">
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => moveDraftExercise(item.id, -1)}
                              title="위로"
                            >
                              <ArrowUp size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => moveDraftExercise(item.id, 1)}
                              title="아래로"
                            >
                              <ArrowDown size={15} aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              className="icon-button danger"
                              onClick={() => removeDraftExercise(item.id)}
                              title="제거"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="form-grid">
                    <label>
                      라운드 수
                      <input
                        type="number"
                        min="1"
                        value={draft.rounds}
                        onChange={(event) => setDraft({ ...draft, rounds: event.target.value })}
                      />
                    </label>
                    <label>
                      라운드 휴식(초)
                      <input
                        type="number"
                        min="0"
                        value={draft.restSeconds}
                        onChange={(event) =>
                          setDraft({ ...draft, restSeconds: event.target.value })
                        }
                      />
                    </label>
                  </div>

                  <div className="button-row">
                    <button
                      className="command-button"
                      type="button"
                      onClick={saveDraft}
                      disabled={draft.exercises.length === 0}
                    >
                      블록 저장
                    </button>
                    <button className="ghost-button" type="button" onClick={() => setDraft(null)}>
                      취소
                    </button>
                  </div>
                </div>
              )}

              <div className="item-list">
                {dayBlocks.length === 0 ? (
                  <p className="empty-state">배치된 운동 없음</p>
                ) : (
                  dayBlocks.map((block, index) => (
                    <div
                      className={`list-item block-item ${
                        block.exercises.length > 1 ? "multi" : ""
                      }`}
                      key={block.id}
                    >
                      <span className="order-badge">{index + 1}</span>
                      <div>
                        {block.exercises.length === 1 ? (
                          <>
                            <strong>{block.exercises[0].name}</strong>
                            <span>
                              {describeSegments(block.exercises[0].segments)} · {block.rounds}세트
                              · 휴식 {formatSeconds(block.restSeconds)}
                            </span>
                          </>
                        ) : (
                          <>
                            <strong>
                              묶음 · {block.exercises.map((item) => item.name).join(" → ")}
                            </strong>
                            <span>
                              {block.rounds}라운드 · 종목 간 휴식 없음 · 라운드 휴식{" "}
                              {formatSeconds(block.restSeconds)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveBlock(block.id, -1)}
                          title="위로"
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveBlock(block.id, 1)}
                          title="아래로"
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="ghost-button"
                          onClick={() => startEditDraft(block)}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => onRemoveBlock(block.id)}
                          title="삭제"
                        >
                          <Trash2 size={17} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">루틴 없음</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default RoutineView;
```

- [ ] **Step 2: Commit**

```bash
git add src/views/RoutineView.tsx
git commit -m "feat: add block-based routine editor view"
```

---

### Task 7: WorkoutView (블록 진행 + 플레이리스트 툴바)

**Files:**
- Create: `src/views/WorkoutView.tsx`

- [ ] **Step 1: `src/views/WorkoutView.tsx` 작성**

```tsx
// 운동 진행 화면. 블록 기반 진행 상태와 유튜브 플레이리스트를 보여준다.
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Grip,
  Maximize2,
  Minimize2,
  MousePointerClick,
  RotateCcw,
  SkipBack,
  SkipForward
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  RoutineBlock,
  Weekday,
  WorkoutSessionState,
  YoutubePlaylist
} from "../types";
import {
  describePrescription,
  describeSegments,
  formatSeconds,
  prescriptionForRound,
  weekdayLabels
} from "../domain/workout";

type WorkoutViewProps = {
  playlists: YoutubePlaylist[];
  selectedPlaylistId: string;
  onSelectPlaylist: (playlistId: string) => void;
  videoIndex: number;
  onNextVideo: () => void;
  onPreviousVideo: () => void;
  embedUrl: string;
  routineName: string;
  weekday: Weekday;
  blocks: RoutineBlock[];
  session: WorkoutSessionState;
  settings: AppSettings;
  restAlert: boolean;
  hasCompletion: boolean;
  onSetComplete: () => void;
  onUndo: () => void;
  onDragStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  canUndo: boolean;
};

function WorkoutView({
  playlists,
  selectedPlaylistId,
  onSelectPlaylist,
  videoIndex,
  onNextVideo,
  onPreviousVideo,
  embedUrl,
  routineName,
  weekday,
  blocks,
  session,
  settings,
  restAlert,
  hasCompletion,
  onSetComplete,
  onUndo,
  onDragStart,
  canUndo
}: WorkoutViewProps) {
  const videoStageRef = useRef<HTMLDivElement | null>(null);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsStageFullscreen(document.fullscreenElement === videoStageRef.current);
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const handleToggleStageFullscreen = async () => {
    if (document.fullscreenElement === videoStageRef.current) {
      await document.exitFullscreen();
      return;
    }

    await videoStageRef.current?.requestFullscreen();
  };

  const playlist = playlists.find((item) => item.id === selectedPlaylistId) ?? null;
  const currentVideo = playlist?.items[videoIndex] ?? null;
  const hasVideos = Boolean(playlist && playlist.items.length > 0);

  const block = blocks[session.blockIndex] ?? null;
  const exercise = block?.exercises[session.exerciseIndex] ?? null;
  const prescription = exercise ? prescriptionForRound(exercise.segments, session.round) : null;
  const nextExercise =
    block && session.exerciseIndex < block.exercises.length - 1
      ? block.exercises[session.exerciseIndex + 1]
      : null;
  const nextPrescription = nextExercise
    ? prescriptionForRound(nextExercise.segments, session.round)
    : null;
  const canCompleteSet = Boolean(exercise) && session.phase === "ready";

  return (
    <section className="screen workout-screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">{weekdayLabels[weekday]}요일</p>
          <h2>{routineName || "활성 루틴 없음"}</h2>
        </div>
        {hasCompletion && (
          <span className="status-pill done">
            <CheckCircle2 size={16} aria-hidden="true" />
            완료
          </span>
        )}
      </div>

      <div className="youtube-toolbar">
        <select
          aria-label="플레이리스트 선택"
          value={selectedPlaylistId}
          onChange={(event) => onSelectPlaylist(event.target.value)}
        >
          <option value="">플레이리스트 선택</option>
          {playlists.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.items.length}개)
            </option>
          ))}
        </select>
        <button
          className="icon-link"
          type="button"
          onClick={onPreviousVideo}
          disabled={!hasVideos}
          title="이전 영상"
        >
          <SkipBack size={17} aria-hidden="true" />
          이전
        </button>
        <span className="video-meta">
          {currentVideo && playlist
            ? `${videoIndex + 1}/${playlist.items.length} · ${currentVideo.label}`
            : "영상 없음"}
        </span>
        <button
          className="icon-link"
          type="button"
          onClick={onNextVideo}
          disabled={!hasVideos}
          title="다음 영상"
        >
          다음
          <SkipForward size={17} aria-hidden="true" />
        </button>
        {currentVideo && (
          <a className="icon-link" href={currentVideo.url} target="_blank" rel="noreferrer">
            <ExternalLink size={17} aria-hidden="true" />
            외부 열기
          </a>
        )}
        <button
          className="icon-link"
          type="button"
          onClick={() => void handleToggleStageFullscreen()}
          title="앱 전체화면"
        >
          {isStageFullscreen ? (
            <Minimize2 size={17} aria-hidden="true" />
          ) : (
            <Maximize2 size={17} aria-hidden="true" />
          )}
          {isStageFullscreen ? "전체화면 종료" : "앱 전체화면"}
        </button>
      </div>

      <div
        ref={videoStageRef}
        className={`video-stage ${restAlert ? "rest-finished" : ""}`}
      >
        {embedUrl ? (
          <iframe
            title="YouTube player"
            src={embedUrl}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div className="video-placeholder">
            <Activity size={48} aria-hidden="true" />
            <span>YouTube</span>
          </div>
        )}

        <div
          className="floating-control"
          style={{
            transform: `translate(${settings.floatingControlPosition.x}px, ${settings.floatingControlPosition.y}px)`
          }}
        >
          <button
            className="drag-handle"
            type="button"
            onPointerDown={onDragStart}
            title="위치 이동"
          >
            <Grip size={18} aria-hidden="true" />
          </button>
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
            <span>{prescription ? describePrescription(prescription) : "루틴을 준비해 주세요"}</span>
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
          <button
            className="icon-button"
            type="button"
            onClick={onNextVideo}
            disabled={!hasVideos}
            title="다음 영상"
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={() => void handleToggleStageFullscreen()}
            title={isStageFullscreen ? "전체화면 종료" : "앱 전체화면"}
          >
            {isStageFullscreen ? (
              <Minimize2 size={18} aria-hidden="true" />
            ) : (
              <Maximize2 size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div className="workout-list">
        {blocks.length === 0 ? (
          <p className="empty-state">오늘 루틴 없음</p>
        ) : (
          blocks.map((item, index) => (
            <div
              key={item.id}
              className={`workout-row ${index === session.blockIndex ? "current" : ""}`}
            >
              <span className="order-badge">{index + 1}</span>
              <div>
                {item.exercises.length === 1 ? (
                  <>
                    <strong>{item.exercises[0].name}</strong>
                    <span>
                      {describeSegments(item.exercises[0].segments)} · {item.rounds}세트 · 휴식{" "}
                      {formatSeconds(item.restSeconds)}
                    </span>
                  </>
                ) : (
                  <>
                    <strong>
                      묶음 · {item.exercises.map((entry) => entry.name).join(" → ")}
                    </strong>
                    <span>
                      {item.rounds}라운드 · 라운드 휴식 {formatSeconds(item.restSeconds)}
                    </span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default WorkoutView;
```

- [ ] **Step 2: Commit**

```bash
git add src/views/WorkoutView.tsx
git commit -m "feat: add block-aware workout view with playlist toolbar"
```

---

### Task 8: PlaylistView (플레이리스트 관리 탭)

**Files:**
- Create: `src/views/PlaylistView.tsx`

- [ ] **Step 1: `src/views/PlaylistView.tsx` 작성**

```tsx
// 유튜브 플레이리스트를 만들고 영상을 관리한다.
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { YoutubePlaylist } from "../types";

type PlaylistViewProps = {
  playlists: YoutubePlaylist[];
  onCreate: (name: string) => void;
  onRename: (playlistId: string, name: string) => void;
  onDelete: (playlistId: string) => void;
  onAddItem: (playlistId: string, url: string) => void;
  onRemoveItem: (playlistId: string, itemId: string) => void;
  onMoveItem: (playlistId: string, itemId: string, direction: -1 | 1) => void;
};

function PlaylistView({
  playlists,
  onCreate,
  onRename,
  onDelete,
  onAddItem,
  onRemoveItem,
  onMoveItem
}: PlaylistViewProps) {
  const [selectedId, setSelectedId] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [renameInput, setRenameInput] = useState<string | null>(null);

  const selected = playlists.find((item) => item.id === selectedId) ?? playlists[0] ?? null;

  const handleCreate = () => {
    const name = nameInput.trim();
    if (!name) {
      return;
    }
    onCreate(name);
    setNameInput("");
  };

  const handleAddItem = () => {
    const url = urlInput.trim();
    if (!selected || !url) {
      return;
    }
    onAddItem(selected.id, url);
    setUrlInput("");
  };

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Playlist</p>
          <h2>플레이리스트</h2>
        </div>
      </div>

      <div className="routine-layout">
        <div className="panel">
          <h3>목록</h3>
          <div className="inline-form">
            <input
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              placeholder="플레이리스트 이름"
            />
            <button className="command-button" type="button" onClick={handleCreate}>
              <Plus size={17} aria-hidden="true" />
              추가
            </button>
          </div>

          <div className="item-list compact">
            {playlists.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={`routine-choice ${selected?.id === playlist.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedId(playlist.id);
                  setRenameInput(null);
                }}
              >
                <span>
                  {playlist.name} ({playlist.items.length})
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel routine-editor">
          {selected ? (
            <>
              <div className="inline-form">
                {renameInput === null ? (
                  <>
                    <h3>{selected.name}</h3>
                    <button
                      className="icon-button"
                      type="button"
                      onClick={() => setRenameInput(selected.name)}
                      title="이름 변경"
                    >
                      <Pencil size={15} aria-hidden="true" />
                    </button>
                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() => {
                        onDelete(selected.id);
                        setSelectedId("");
                      }}
                      title="플레이리스트 삭제"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      value={renameInput}
                      onChange={(event) => setRenameInput(event.target.value)}
                      aria-label="새 이름"
                    />
                    <button
                      className="command-button"
                      type="button"
                      onClick={() => {
                        if (renameInput.trim()) {
                          onRename(selected.id, renameInput.trim());
                        }
                        setRenameInput(null);
                      }}
                    >
                      저장
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setRenameInput(null)}
                    >
                      취소
                    </button>
                  </>
                )}
              </div>

              <div className="inline-form">
                <input
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  placeholder="YouTube URL 붙여넣기"
                  aria-label="YouTube URL"
                />
                <button className="command-button" type="button" onClick={handleAddItem}>
                  <Plus size={17} aria-hidden="true" />
                  추가
                </button>
              </div>

              <div className="item-list">
                {selected.items.length === 0 ? (
                  <p className="empty-state">영상 없음</p>
                ) : (
                  selected.items.map((item, index) => (
                    <div className="list-item" key={item.id}>
                      <span className="order-badge">{index + 1}</span>
                      <div>
                        <strong>{item.label}</strong>
                        <span>{item.url}</span>
                      </div>
                      <div className="item-actions">
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveItem(selected.id, item.id, -1)}
                          title="위로"
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => onMoveItem(selected.id, item.id, 1)}
                          title="아래로"
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => onRemoveItem(selected.id, item.id)}
                          title="삭제"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">플레이리스트를 만들어 주세요</p>
          )}
        </div>
      </div>
    </section>
  );
}

export default PlaylistView;
```

- [ ] **Step 2: Commit**

```bash
git add src/views/PlaylistView.tsx
git commit -m "feat: add playlist management view"
```

---

### Task 9: CalendarView · SettingsView 분리 (기계적 이동)

**Files:**
- Create: `src/views/CalendarView.tsx` — 기존 `App.tsx`의 `CalendarView` 함수(1023~1067행)를 그대로 이동
- Create: `src/views/SettingsView.tsx` — 기존 `App.tsx`의 `SettingsView` 함수(1069~1138행)를 그대로 이동

- [ ] **Step 1: `src/views/CalendarView.tsx` 작성**

```tsx
// 월간 완료 기록 달력을 보여준다.
import { CheckCircle2 } from "lucide-react";
import { toDateKey, weekdayLabels, weekdays } from "../domain/workout";

function CalendarView({ completions }: { completions: Map<string, unknown> }) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOffset = (first.getDay() + 6) % 7;
  const totalDays = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: startOffset + totalDays }, (_, index) => {
    const dayNumber = index - startOffset + 1;
    return dayNumber > 0 ? dayNumber : null;
  });

  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Calendar</p>
          <h2>
            {today.getFullYear()}년 {today.getMonth() + 1}월
          </h2>
        </div>
      </div>

      <div className="calendar-grid weekday-header">
        {weekdays.map((day) => (
          <span key={day}>{weekdayLabels[day]}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {cells.map((day, index) => {
          if (!day) {
            return <div className="calendar-cell empty" key={`empty-${index}`} />;
          }
          const date = new Date(today.getFullYear(), today.getMonth(), day);
          const key = toDateKey(date);
          const done = completions.has(key);
          return (
            <div className={`calendar-cell ${done ? "done" : ""}`} key={key}>
              <span>{day}</span>
              {done && <CheckCircle2 size={18} aria-hidden="true" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default CalendarView;
```

- [ ] **Step 2: `src/views/SettingsView.tsx` 작성**

```tsx
// 알람과 입력 설정을 관리한다.
import { Volume2 } from "lucide-react";
import type { AppSettings } from "../types";
import { clampVolume } from "../domain/workout";

function SettingsView({
  settings,
  onChange
}: {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}) {
  return (
    <section className="screen">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preferences</p>
          <h2>설정</h2>
        </div>
      </div>

      <div className="panel settings-panel">
        <label className="range-row">
          <span>
            <Volume2 size={18} aria-hidden="true" />
            알람 볼륨
          </span>
          <input
            type="range"
            min="0"
            max="100"
            value={settings.alarmVolume}
            onChange={(event) =>
              onChange({ ...settings, alarmVolume: clampVolume(Number(event.target.value)) })
            }
          />
          <strong>{settings.alarmVolume}</strong>
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.restEndSoundEnabled}
            onChange={(event) =>
              onChange({ ...settings, restEndSoundEnabled: event.target.checked })
            }
          />
          휴식 종료 소리
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.restEndVisualAlertEnabled}
            onChange={(event) =>
              onChange({ ...settings, restEndVisualAlertEnabled: event.target.checked })
            }
          />
          휴식 종료 화면 강조
        </label>

        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings.keyboardShortcutEnabled}
            onChange={(event) =>
              onChange({ ...settings, keyboardShortcutEnabled: event.target.checked })
            }
          />
          단축키 보조 입력
        </label>
      </div>
    </section>
  );
}

export default SettingsView;
```

- [ ] **Step 3: Commit**

```bash
git add src/views/CalendarView.tsx src/views/SettingsView.tsx
git commit -m "refactor: move calendar and settings views into files"
```

---

### Task 10: App.tsx 재작성 + 스타일

**Files:**
- Modify: `src/App.tsx` (전체 교체)
- Modify: `src/styles.css` (끝에 추가)

- [ ] **Step 1: `src/App.tsx` 전체 교체**

```tsx
// 운동 companion의 화면과 사용자 흐름을 구성한다.
import {
  Activity,
  CalendarDays,
  Dumbbell,
  ListChecks,
  ListVideo,
  Settings
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceSet,
  clampVolume,
  createCompletion,
  createId,
  createSingleBlock,
  defaultSettings,
  emptyRoutineDays,
  finishRest,
  getRoutineForDate,
  getTodayKey,
  initialWorkoutSession,
  parseClusterReps,
  setActiveRoutine,
  toDateKey
} from "./domain/workout";
import {
  loadAppData,
  saveCompletions,
  saveExercises,
  savePlaylists,
  saveRoutines,
  saveSettings
} from "./storage/db";
import type {
  AppData,
  AppSettings,
  ExerciseItem,
  RoutineBlock,
  RoutinePreset,
  SetSegment,
  Weekday,
  WorkoutSessionState,
  YoutubePlaylist
} from "./types";
import {
  fetchYoutubeTitle,
  nextPlaylistIndex,
  previousPlaylistIndex,
  toYoutubeEmbedUrl
} from "./utils/youtube";
import CalendarView from "./views/CalendarView";
import ExerciseLibraryView, {
  emptyExerciseForm,
  type ExerciseForm
} from "./views/ExerciseLibraryView";
import PlaylistView from "./views/PlaylistView";
import RoutineView from "./views/RoutineView";
import SettingsView from "./views/SettingsView";
import WorkoutView from "./views/WorkoutView";

type Tab = "workout" | "exercises" | "routines" | "playlists" | "calendar" | "settings";

const tabItems: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "workout", label: "운동", icon: Activity },
  { id: "exercises", label: "운동 목록", icon: Dumbbell },
  { id: "routines", label: "루틴", icon: ListChecks },
  { id: "playlists", label: "플레이리스트", icon: ListVideo },
  { id: "calendar", label: "달력", icon: CalendarDays },
  { id: "settings", label: "설정", icon: Settings }
];

const makeRoutine = (name: string, isActive: boolean): RoutinePreset => {
  const now = new Date().toISOString();
  return {
    id: createId("routine"),
    name,
    isActive,
    days: emptyRoutineDays(),
    createdAt: now,
    updatedAt: now
  };
};

const playAlarm = (settings: AppSettings) => {
  if (!settings.restEndSoundEnabled || settings.alarmVolume <= 0) {
    return;
  }

  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  gain.gain.value = clampVolume(settings.alarmVolume) / 100;
  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.28);
};

type NormalizedExercise = {
  name: string;
  restSeconds: number;
  segments: SetSegment[];
};

const normalizeExerciseForm = (
  form: ExerciseForm
): { ok: true; value: NormalizedExercise } | { ok: false; error: string } => {
  const name = form.name.trim();
  if (!name) {
    return { ok: false, error: "운동명을 입력해 주세요." };
  }
  if (form.segments.length === 0) {
    return { ok: false, error: "구간을 1개 이상 추가해 주세요." };
  }

  const segments: SetSegment[] = [];
  for (const segment of form.segments) {
    const sets = Math.max(1, Number(segment.sets) || 1);
    if (segment.type === "normal") {
      segments.push({
        id: segment.id,
        type: "normal",
        sets,
        weight: segment.weight.trim(),
        reps: Math.max(1, Number(segment.reps) || 1),
        clusterReps: [],
        intraRestSeconds: 0
      });
    } else {
      const clusterReps = parseClusterReps(segment.clusterReps);
      if (!clusterReps) {
        return { ok: false, error: '클러스터 횟수는 "10+8+6" 형식으로 입력해 주세요.' };
      }
      segments.push({
        id: segment.id,
        type: "cluster",
        sets,
        weight: segment.weight.trim(),
        reps: 0,
        clusterReps,
        intraRestSeconds: Math.max(0, Number(segment.intraRestSeconds) || 0)
      });
    }
  }

  return {
    ok: true,
    value: { name, restSeconds: Math.max(0, Number(form.restSeconds) || 0), segments }
  };
};

const exerciseToForm = (exercise: ExerciseItem): ExerciseForm => ({
  name: exercise.name,
  restSeconds: String(exercise.restSeconds),
  segments: exercise.segments.map((segment) => ({
    id: segment.id,
    type: segment.type,
    sets: String(segment.sets),
    weight: segment.weight,
    reps: String(segment.reps || 10),
    clusterReps: segment.clusterReps.join("+") || "10+8+6",
    intraRestSeconds: String(segment.intraRestSeconds)
  }))
});

function App() {
  const [tab, setTab] = useState<Tab>("workout");
  const [data, setData] = useState<AppData>({
    version: 2,
    exercises: [],
    routines: [],
    completions: [],
    playlists: [],
    settings: defaultSettings
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(emptyExerciseForm);
  const [formError, setFormError] = useState("");
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<Weekday>(getTodayKey());
  const [selectedPlaylistId, setSelectedPlaylistId] = useState("");
  const [videoIndex, setVideoIndex] = useState(0);
  const [session, setSession] = useState<WorkoutSessionState>(initialWorkoutSession);
  const [previousSession, setPreviousSession] = useState<WorkoutSessionState | null>(null);
  const [restAlert, setRestAlert] = useState(false);
  const latestPositionRef = useRef(data.settings.floatingControlPosition);

  useEffect(() => {
    loadAppData()
      .then((loaded) => {
        setData(loaded);
        const active = loaded.routines.find((routine) => routine.isActive);
        setSelectedRoutineId(active?.id ?? loaded.routines[0]?.id ?? "");
        setSelectedPlaylistId(loaded.playlists[0]?.id ?? "");
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    latestPositionRef.current = data.settings.floatingControlPosition;
  }, [data.settings.floatingControlPosition]);

  const todayPlan = useMemo(() => getRoutineForDate(data.routines), [data.routines]);
  const selectedRoutine = data.routines.find((routine) => routine.id === selectedRoutineId) ?? null;
  const selectedPlaylist =
    data.playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const currentVideo = selectedPlaylist?.items[videoIndex] ?? null;
  const embedUrl = currentVideo ? toYoutubeEmbedUrl(currentVideo.url) : "";
  const completedDates = useMemo(
    () => new Map(data.completions.filter((item) => item.completed).map((item) => [item.date, item])),
    [data.completions]
  );

  useEffect(() => {
    setSession(initialWorkoutSession());
    setPreviousSession(null);
    setRestAlert(false);
  }, [todayPlan.routine?.id, todayPlan.weekday]);

  // 플레이리스트 변경/항목 삭제 시 재생 인덱스 보정
  useEffect(() => {
    setVideoIndex((current) => {
      const length = selectedPlaylist?.items.length ?? 0;
      return length === 0 ? 0 : Math.min(current, length - 1);
    });
  }, [selectedPlaylistId, selectedPlaylist?.items.length]);

  const updateExercises = (next: ExerciseItem[]) => {
    setData((current) => ({ ...current, exercises: next }));
    void saveExercises(next);
  };

  const updateRoutines = (next: RoutinePreset[]) => {
    setData((current) => ({ ...current, routines: next }));
    void saveRoutines(next);
  };

  const updateCompletions = (next: AppData["completions"]) => {
    setData((current) => ({ ...current, completions: next }));
    void saveCompletions(next);
  };

  const updatePlaylists = (next: YoutubePlaylist[]) => {
    setData((current) => ({ ...current, playlists: next }));
    void savePlaylists(next);
  };

  const updateSettings = (next: AppSettings) => {
    setData((current) => ({ ...current, settings: next }));
    void saveSettings(next);
  };

  // --- 운동 등록 ---

  const handleSaveExercise = () => {
    const normalized = normalizeExerciseForm(exerciseForm);
    if (!normalized.ok) {
      setFormError(normalized.error);
      return;
    }
    setFormError("");

    const now = new Date().toISOString();
    if (editingExerciseId) {
      updateExercises(
        data.exercises.map((exercise) =>
          exercise.id === editingExerciseId
            ? { ...exercise, ...normalized.value, updatedAt: now }
            : exercise
        )
      );
    } else {
      updateExercises([
        ...data.exercises,
        { id: createId("exercise"), ...normalized.value, createdAt: now, updatedAt: now }
      ]);
    }

    setExerciseForm(emptyExerciseForm());
    setEditingExerciseId(null);
  };

  const handleEditExercise = (exercise: ExerciseItem) => {
    setExerciseForm(exerciseToForm(exercise));
    setEditingExerciseId(exercise.id);
    setFormError("");
  };

  const handleDeleteExercise = (exerciseId: string) => {
    updateExercises(data.exercises.filter((exercise) => exercise.id !== exerciseId));
  };

  // --- 루틴 ---

  const handleCreateRoutine = () => {
    const name = routineName.trim();
    if (!name) {
      return;
    }

    const nextRoutine = makeRoutine(name, data.routines.length === 0);
    updateRoutines(data.routines.length === 0 ? [nextRoutine] : [...data.routines, nextRoutine]);
    setSelectedRoutineId(nextRoutine.id);
    setRoutineName("");
  };

  const handleActivateRoutine = (routineId: string) => {
    updateRoutines(setActiveRoutine(data.routines, routineId));
    setSelectedRoutineId(routineId);
  };

  const mutateSelectedDay = (
    mutate: (blocks: RoutineBlock[]) => RoutineBlock[]
  ) => {
    if (!selectedRoutine) {
      return;
    }
    updateRoutines(
      data.routines.map((routine) =>
        routine.id === selectedRoutine.id
          ? {
              ...routine,
              days: { ...routine.days, [selectedDay]: mutate(routine.days[selectedDay]) },
              updatedAt: new Date().toISOString()
            }
          : routine
      )
    );
  };

  const handleAddSingleBlock = (exerciseId: string) => {
    const exercise = data.exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }
    mutateSelectedDay((blocks) => [
      ...blocks,
      { ...createSingleBlock(exercise), order: blocks.length }
    ]);
  };

  const handleSaveBlock = (block: RoutineBlock) => {
    mutateSelectedDay((blocks) => {
      const exists = blocks.some((item) => item.id === block.id);
      return exists
        ? blocks.map((item) => (item.id === block.id ? { ...block, order: item.order } : item))
        : [...blocks, { ...block, order: blocks.length }];
    });
  };

  const handleRemoveBlock = (blockId: string) => {
    mutateSelectedDay((blocks) =>
      blocks
        .filter((item) => item.id !== blockId)
        .map((item, index) => ({ ...item, order: index }))
    );
  };

  const handleMoveBlock = (blockId: string, direction: -1 | 1) => {
    mutateSelectedDay((blocks) => {
      const sorted = [...blocks].sort((a, b) => a.order - b.order);
      const index = sorted.findIndex((item) => item.id === blockId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= sorted.length) {
        return blocks;
      }
      [sorted[index], sorted[target]] = [sorted[target], sorted[index]];
      return sorted.map((item, order) => ({ ...item, order }));
    });
  };

  // --- 플레이리스트 ---

  const handleCreatePlaylist = (name: string) => {
    const now = new Date().toISOString();
    const playlist: YoutubePlaylist = {
      id: createId("playlist"),
      name,
      items: [],
      createdAt: now,
      updatedAt: now
    };
    updatePlaylists([...data.playlists, playlist]);
    if (!selectedPlaylistId) {
      setSelectedPlaylistId(playlist.id);
    }
  };

  const mutatePlaylist = (
    playlistId: string,
    mutate: (playlist: YoutubePlaylist) => YoutubePlaylist
  ) => {
    updatePlaylists(
      data.playlists.map((playlist) =>
        playlist.id === playlistId
          ? { ...mutate(playlist), updatedAt: new Date().toISOString() }
          : playlist
      )
    );
  };

  const handleRenamePlaylist = (playlistId: string, name: string) => {
    mutatePlaylist(playlistId, (playlist) => ({ ...playlist, name }));
  };

  const handleDeletePlaylist = (playlistId: string) => {
    updatePlaylists(data.playlists.filter((playlist) => playlist.id !== playlistId));
    if (selectedPlaylistId === playlistId) {
      setSelectedPlaylistId("");
      setVideoIndex(0);
    }
  };

  const handleAddPlaylistItem = (playlistId: string, url: string) => {
    const itemId = createId("video");
    // 제목은 비동기로 받아오고, 그 전까지 URL을 라벨로 보여준다.
    mutatePlaylist(playlistId, (playlist) => ({
      ...playlist,
      items: [...playlist.items, { id: itemId, url, label: url }]
    }));

    void fetchYoutubeTitle(url).then((label) => {
      setData((current) => {
        const next = current.playlists.map((playlist) =>
          playlist.id === playlistId
            ? {
                ...playlist,
                items: playlist.items.map((item) =>
                  item.id === itemId ? { ...item, label } : item
                )
              }
            : playlist
        );
        void savePlaylists(next);
        return { ...current, playlists: next };
      });
    });
  };

  const handleRemovePlaylistItem = (playlistId: string, itemId: string) => {
    mutatePlaylist(playlistId, (playlist) => ({
      ...playlist,
      items: playlist.items.filter((item) => item.id !== itemId)
    }));
  };

  const handleMovePlaylistItem = (playlistId: string, itemId: string, direction: -1 | 1) => {
    mutatePlaylist(playlistId, (playlist) => {
      const index = playlist.items.findIndex((item) => item.id === itemId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= playlist.items.length) {
        return playlist;
      }
      const items = [...playlist.items];
      [items[index], items[target]] = [items[target], items[index]];
      return { ...playlist, items };
    });
  };

  const handleNextVideo = () => {
    if (selectedPlaylist && selectedPlaylist.items.length > 0) {
      setVideoIndex(nextPlaylistIndex(selectedPlaylist.items.length, videoIndex));
    }
  };

  const handlePreviousVideo = () => {
    if (selectedPlaylist && selectedPlaylist.items.length > 0) {
      setVideoIndex(previousPlaylistIndex(selectedPlaylist.items.length, videoIndex));
    }
  };

  // --- 운동 진행 ---

  const completeWorkoutForToday = useCallback(() => {
    if (!todayPlan.routine) {
      return;
    }

    const completion = createCompletion(todayPlan.routine.id);
    updateCompletions([
      ...data.completions.filter((item) => item.date !== completion.date),
      completion
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.completions, todayPlan.routine]);

  const handleSetComplete = useCallback(() => {
    if (!todayPlan.routine || todayPlan.blocks.length === 0 || session.phase !== "ready") {
      return;
    }

    setPreviousSession(session);
    const result = advanceSet(session, todayPlan.blocks);
    setSession(result.state);
    setRestAlert(false);

    if (result.completedWorkout) {
      completeWorkoutForToday();
    }
  }, [completeWorkoutForToday, session, todayPlan.blocks, todayPlan.routine]);

  const handleUndo = () => {
    if (!previousSession) {
      return;
    }

    if (session.phase === "complete") {
      const today = toDateKey();
      updateCompletions(data.completions.filter((item) => item.date !== today));
    }

    setSession(previousSession);
    setPreviousSession(null);
    setRestAlert(false);
  };

  useEffect(() => {
    if (session.phase !== "rest" || session.remainingRestSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setSession((current) => {
        if (current.phase !== "rest") {
          return current;
        }

        if (current.remainingRestSeconds <= 1) {
          if (data.settings.restEndVisualAlertEnabled) {
            setRestAlert(true);
          }
          playAlarm(data.settings);
          return finishRest(current);
        }

        return { ...current, remainingRestSeconds: current.remainingRestSeconds - 1 };
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [data.settings, session.phase, session.remainingRestSeconds]);

  useEffect(() => {
    if (!data.settings.keyboardShortcutEnabled) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (isTyping || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      handleSetComplete();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data.settings.keyboardShortcutEnabled, handleSetComplete]);

  const handleDragStart = (event: React.PointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = latestPositionRef.current;
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const nextPosition = {
        x: Math.max(12, origin.x + moveEvent.clientX - startX),
        y: Math.max(12, origin.y + moveEvent.clientY - startY)
      };
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

  if (!isLoaded) {
    return <main className="loading">데이터를 불러오는 중입니다.</main>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Dumbbell size={24} aria-hidden="true" />
          </div>
          <div>
            <h1>Collector</h1>
            <p>Workout Companion</p>
          </div>
        </div>

        <nav className="tab-list" aria-label="주요 화면">
          {tabItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`tab-button ${tab === item.id ? "active" : ""}`}
                type="button"
                onClick={() => setTab(item.id)}
                title={item.label}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main-surface">
        {tab === "workout" && (
          <WorkoutView
            playlists={data.playlists}
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={(playlistId) => {
              setSelectedPlaylistId(playlistId);
              setVideoIndex(0);
            }}
            videoIndex={videoIndex}
            onNextVideo={handleNextVideo}
            onPreviousVideo={handlePreviousVideo}
            embedUrl={embedUrl}
            routineName={todayPlan.routine?.name ?? ""}
            weekday={todayPlan.weekday}
            blocks={todayPlan.blocks}
            session={session}
            settings={data.settings}
            restAlert={restAlert}
            hasCompletion={completedDates.has(toDateKey())}
            onSetComplete={handleSetComplete}
            onUndo={handleUndo}
            onDragStart={handleDragStart}
            canUndo={Boolean(previousSession)}
          />
        )}

        {tab === "exercises" && (
          <ExerciseLibraryView
            exercises={data.exercises}
            form={exerciseForm}
            editingExerciseId={editingExerciseId}
            formError={formError}
            onFormChange={setExerciseForm}
            onSave={handleSaveExercise}
            onEdit={handleEditExercise}
            onDelete={handleDeleteExercise}
            onCancelEdit={() => {
              setExerciseForm(emptyExerciseForm());
              setEditingExerciseId(null);
              setFormError("");
            }}
          />
        )}

        {tab === "routines" && (
          <RoutineView
            routines={data.routines}
            exercises={data.exercises}
            selectedRoutine={selectedRoutine}
            selectedRoutineId={selectedRoutineId}
            selectedDay={selectedDay}
            routineName={routineName}
            onRoutineNameChange={setRoutineName}
            onCreateRoutine={handleCreateRoutine}
            onSelectRoutine={setSelectedRoutineId}
            onActivateRoutine={handleActivateRoutine}
            onSelectedDayChange={setSelectedDay}
            onAddSingleBlock={handleAddSingleBlock}
            onSaveBlock={handleSaveBlock}
            onRemoveBlock={handleRemoveBlock}
            onMoveBlock={handleMoveBlock}
          />
        )}

        {tab === "playlists" && (
          <PlaylistView
            playlists={data.playlists}
            onCreate={handleCreatePlaylist}
            onRename={handleRenamePlaylist}
            onDelete={handleDeletePlaylist}
            onAddItem={handleAddPlaylistItem}
            onRemoveItem={handleRemovePlaylistItem}
            onMoveItem={handleMovePlaylistItem}
          />
        )}

        {tab === "calendar" && <CalendarView completions={completedDates} />}

        {tab === "settings" && (
          <SettingsView
            settings={data.settings}
            onChange={(settings) => updateSettings(settings)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
```

주의: `emptyExerciseForm`은 함수다 — `useState<ExerciseForm>(emptyExerciseForm)`은 lazy initializer로 동작해 그대로 쓸 수 있고, 리셋 시에는 `emptyExerciseForm()`을 호출한다.

- [ ] **Step 2: `src/styles.css` 끝에 추가**

```css
/* --- 블록/세그먼트 편집 --- */
.segment-card {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
}

.segment-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.block-draft {
  border: 1px solid rgba(16, 185, 129, 0.35);
  border-radius: 10px;
  padding: 12px;
  margin: 10px 0;
  background: rgba(16, 185, 129, 0.06);
}

.block-item.multi {
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.05);
}

.error-text {
  color: #f87171;
  font-size: 13px;
  margin: 8px 0 0;
}

/* --- 플레이리스트 툴바 --- */
.youtube-toolbar select {
  max-width: 220px;
}

.video-meta {
  font-size: 13px;
  opacity: 0.8;
  max-width: 320px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* --- 플로팅 컨트롤 다음 운동 안내 --- */
.next-hint {
  font-size: 11px;
  opacity: 0.7;
}
```

- [ ] **Step 3: 빌드와 테스트 확인**

Run: `npm test && npm run build`
Expected: 테스트 전체 PASS, `tsc -b && vite build` 성공

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/styles.css
git commit -m "feat: wire block workout flow and playlists into app shell"
```

---

### Task 11: 최종 검증

- [ ] **Step 1: 전체 테스트 + 빌드**

Run: `npm test && npm run build`
Expected: PASS / 빌드 성공

- [ ] **Step 2: 수동 확인 (dev 서버)**

Run: `npm run dev` 후 브라우저에서:
1. 운동 목록: 일반 3세트 + 클러스터 2세트 구간으로 "바벨 컬" 등록 → 목록 요약에 "일반 25kg×12회 ×3세트 · 클러스터 10+8+6회 ×2세트" 표시
2. 루틴: 단독 추가(바벨 컬) + 묶음 블록(트라이셉스 → V업, 3라운드, 휴식 30초) 생성, 순서 이동
3. 운동 탭: "세트 완료" 클릭 흐름 — 묶음 블록에서 종목 간 즉시 이동(타이머 안 돎), 라운드 끝나면 휴식 타이머, 클러스터 라운드에서 "10 + 8 + 6회 · 중간휴식 5초" 표시
4. 플레이리스트: 목록 생성, URL 2개 추가(제목 자동 표시), 운동 탭에서 선택 후 다음/이전 순환, 플로팅 ⏭ 동작
5. 기존 v1 데이터가 있던 브라우저라면: 기존 운동/루틴이 블록으로 보이는지 확인

- [ ] **Step 3: 이상 없으면 완료 보고**

문제 발견 시 superpowers:systematic-debugging 으로 원인 파악 후 수정.

---

## Self-Review 결과

- 스펙 커버리지: 구간 등록(Task 1·5), 블록 모델·엔진(Task 1), 라운드→처방 매핑(Task 1), 마이그레이션(Task 2·4), 플레이리스트 다수·수동 넘김·oEmbed(Task 3·8), 운동 중 표시·플로팅 ⏭(Task 7), 관리 탭(Task 8), 예외 처리(빈 블록 필터 Task 1, 클러스터 파싱 Task 1·10, 제목 실패 폴백 Task 3, 순환 Task 3) — 전부 매핑됨.
- 스펙과 다른 점 1가지: 순서 변경을 드래그 대신 ↑↓ 버튼으로 구현 (Task 6에 명시, 후속 개선 여지).
- 타입/시그니처 일관성: `prescriptionForRound(segments, round)`, `createMultiBlock(exercises, rounds, restSeconds)`, `emptyExerciseForm()` 호출 형태 등 태스크 간 일치 확인.
```
