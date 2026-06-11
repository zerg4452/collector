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

  it("detects legacy snapshots inside routine days", () => {
    const legacyRoutine = {
      id: "routine-1",
      name: "기본 루틴",
      isActive: true,
      days: { ...emptyRoutineDays(), monday: [legacySnapshot] },
      createdAt: "2026-06-11T00:00:00.000Z",
      updatedAt: "2026-06-11T00:00:00.000Z"
    } as unknown as RoutinePreset;

    expect(needsMigration([], [legacyRoutine])).toBe(true);
    expect(needsMigration([], [migrateRoutine(legacyRoutine)])).toBe(false);
  });

  it("clamps zero sets and reps to one during migration", () => {
    const migrated = migrateExercise({ ...legacyExercise, sets: 0, targetReps: 0 });

    expect(migrated.segments[0].sets).toBe(1);
    expect(migrated.segments[0].reps).toBe(1);
  });
});
