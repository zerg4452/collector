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

  it("accepts an explicit order for created blocks", () => {
    expect(createSingleBlock(exercise(), 4).order).toBe(4);
    expect(
      createMultiBlock([createBlockExercise(exercise(), 0)], 2, 30, 7).order
    ).toBe(7);
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

  it("skips the rest phase when the block rest is zero", () => {
    const single = createSingleBlock(
      exercise({ id: "exercise-1", segments: [normalSegment({ sets: 2 })], restSeconds: 0 })
    );

    const result = advanceSet(initialWorkoutSession(), [single]);

    expect(result.state.phase).toBe("ready");
    expect(result.state.round).toBe(2);
    expect(result.restSourceSeconds).toBe(0);
  });

  it("skips empty blocks without consuming a rest", () => {
    const emptyBlock: RoutineBlock = {
      id: "block-empty",
      exercises: [],
      rounds: 3,
      restSeconds: 60,
      order: 0
    };
    const single = createSingleBlock(exercise({ segments: [normalSegment({ sets: 1 })] }));

    const result = advanceSet(
      { ...initialWorkoutSession(), blockIndex: 0 },
      [emptyBlock, single]
    );

    expect(result.state.phase).toBe("ready");
    expect(result.state.blockIndex).toBe(1);
    expect(result.restSourceSeconds).toBe(0);
  });
});
