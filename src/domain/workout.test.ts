// 운동 진행 도메인 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import type { ExerciseItem, RoutinePreset } from "../types";
import {
  advanceSet,
  createSnapshot,
  emptyRoutineDays,
  finishRest,
  getRoutineForDate,
  initialWorkoutSession,
  setActiveRoutine
} from "./workout";

const exercise = (overrides: Partial<ExerciseItem> = {}): ExerciseItem => ({
  id: "exercise-1",
  name: "벤치프레스",
  weight: "60kg",
  targetReps: 5,
  sets: 2,
  restSeconds: 90,
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

describe("workout domain", () => {
  it("copies exercise data into a routine snapshot", () => {
    const source = exercise();
    const snapshot = createSnapshot(source, 0);

    expect(snapshot.sourceExerciseId).toBe(source.id);
    expect(snapshot.name).toBe("벤치프레스");
    expect(snapshot.weight).toBe("60kg");
    expect(snapshot.targetReps).toBe(5);
    expect(snapshot.sets).toBe(2);
    expect(snapshot.restSeconds).toBe(90);
    expect(snapshot).not.toBe(source);
  });

  it("keeps only one active routine", () => {
    const routines = [
      routine({ id: "routine-1", isActive: true }),
      routine({ id: "routine-2", name: "회복 루틴" })
    ];

    const next = setActiveRoutine(routines, "routine-2");

    expect(next.find((item) => item.id === "routine-1")?.isActive).toBe(false);
    expect(next.find((item) => item.id === "routine-2")?.isActive).toBe(true);
  });

  it("loads exercises for the active routine weekday", () => {
    const snapshot = createSnapshot(exercise(), 0);
    const active = routine({
      isActive: true,
      days: { ...emptyRoutineDays(), thursday: [snapshot] }
    });

    const plan = getRoutineForDate([active], new Date("2026-06-11T12:00:00+09:00"));

    expect(plan.weekday).toBe("thursday");
    expect(plan.exercises).toHaveLength(1);
    expect(plan.exercises[0].name).toBe("벤치프레스");
  });

  it("advances a set into rest and then ready state", () => {
    const snapshot = createSnapshot(exercise({ sets: 2, restSeconds: 45 }), 0);
    const result = advanceSet(initialWorkoutSession(), [snapshot]);

    expect(result.completedWorkout).toBe(false);
    expect(result.state.phase).toBe("rest");
    expect(result.state.completedSets).toBe(1);
    expect(result.state.remainingRestSeconds).toBe(45);
    expect(finishRest(result.state).phase).toBe("ready");
  });

  it("marks the workout complete after the last set", () => {
    const snapshot = createSnapshot(exercise({ sets: 1 }), 0);
    const result = advanceSet(initialWorkoutSession(), [snapshot]);

    expect(result.completedWorkout).toBe(true);
    expect(result.state.phase).toBe("complete");
    expect(result.state.completedSets).toBe(1);
  });
});
