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
  keyboardShortcutEnabled: true,
  routineMode: "routine"
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
  if (parts.some((part) => !/^[0-9]+$/.test(part) || Number(part) < 1)) {
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

export const createSingleBlock = (exercise: ExerciseItem, order = 0): RoutineBlock => ({
  id: createId("block"),
  exercises: [createBlockExercise(exercise, 0)],
  rounds: Math.max(1, totalSets(exercise.segments)),
  restSeconds: exercise.restSeconds,
  order
});

export const createMultiBlock = (
  exercises: BlockExerciseSnapshot[],
  rounds: number,
  restSeconds: number,
  order = 0
): RoutineBlock => ({
  id: createId("block"),
  exercises: exercises.map((exercise, index) => ({ ...exercise, order: index })),
  rounds: Math.max(1, rounds),
  restSeconds: Math.max(0, restSeconds),
  order
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

  // 빈 블록은 휴식 없이 건너뛴다 (방어적 가드 — 평소엔 getRoutineForDate가 걸러냄)
  if (block.exercises.length === 0) {
    if (state.blockIndex >= blocks.length - 1) {
      return {
        state: { ...state, phase: "complete", remainingRestSeconds: 0 },
        completedWorkout: true,
        restSourceSeconds: 0
      };
    }
    return {
      state: { ...state, blockIndex: state.blockIndex + 1, round: 1, exerciseIndex: 0 },
      completedWorkout: false,
      restSourceSeconds: 0
    };
  }

  // 1. 블록 안 다음 종목으로 — 휴식 없음
  if (state.exerciseIndex < block.exercises.length - 1) {
    return {
      state: { ...state, exerciseIndex: state.exerciseIndex + 1 },
      completedWorkout: false,
      restSourceSeconds: 0
    };
  }

  // 2. 라운드 종료, 다음 라운드 남음 — 라운드 휴식 (0초면 바로 진행)
  if (state.round < block.rounds) {
    return {
      state: {
        ...state,
        round: state.round + 1,
        exerciseIndex: 0,
        phase: block.restSeconds > 0 ? "rest" : "ready",
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

  // 4. 다음 블록으로 — 끝난 블록의 휴식 적용 (0초면 바로 진행)
  return {
    state: {
      blockIndex: state.blockIndex + 1,
      round: 1,
      exerciseIndex: 0,
      phase: block.restSeconds > 0 ? "rest" : "ready",
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
  id: toDateKey(date),
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
