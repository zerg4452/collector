// 운동 루틴 스냅샷과 세트 진행 규칙을 계산한다.
import type {
  AppSettings,
  ExerciseItem,
  RoutineExerciseSnapshot,
  RoutinePreset,
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

export const emptyRoutineDays = (): Record<Weekday, RoutineExerciseSnapshot[]> => ({
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

export const createSnapshot = (
  exercise: ExerciseItem,
  order: number
): RoutineExerciseSnapshot => ({
  id: createId("snapshot"),
  sourceExerciseId: exercise.id,
  name: exercise.name,
  weight: exercise.weight,
  targetReps: exercise.targetReps,
  sets: exercise.sets,
  restSeconds: exercise.restSeconds,
  order
});

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
  if (!routine) {
    return { routine: null, weekday: getTodayKey(date), exercises: [] };
  }

  const weekday = getTodayKey(date);
  return {
    routine,
    weekday,
    exercises: [...routine.days[weekday]].sort((a, b) => a.order - b.order)
  };
};

export const initialWorkoutSession = (): WorkoutSessionState => ({
  exerciseIndex: 0,
  completedSets: 0,
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
  exercises: RoutineExerciseSnapshot[]
): AdvanceResult => {
  const current = exercises[state.exerciseIndex];
  if (!current || state.phase === "complete" || state.phase === "rest") {
    return { state, completedWorkout: state.phase === "complete", restSourceSeconds: 0 };
  }

  const nextCompletedSets = state.completedSets + 1;
  const currentExerciseDone = nextCompletedSets >= current.sets;
  const isLastExercise = state.exerciseIndex >= exercises.length - 1;

  if (currentExerciseDone && isLastExercise) {
    return {
      state: {
        exerciseIndex: state.exerciseIndex,
        completedSets: nextCompletedSets,
        phase: "complete",
        remainingRestSeconds: 0
      },
      completedWorkout: true,
      restSourceSeconds: 0
    };
  }

  const nextExerciseIndex = currentExerciseDone ? state.exerciseIndex + 1 : state.exerciseIndex;
  const nextCompletedForShownExercise = currentExerciseDone ? 0 : nextCompletedSets;

  return {
    state: {
      exerciseIndex: nextExerciseIndex,
      completedSets: nextCompletedForShownExercise,
      phase: "rest",
      remainingRestSeconds: current.restSeconds
    },
    completedWorkout: false,
    restSourceSeconds: current.restSeconds
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
