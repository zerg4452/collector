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
