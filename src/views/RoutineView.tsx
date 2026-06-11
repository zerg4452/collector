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
