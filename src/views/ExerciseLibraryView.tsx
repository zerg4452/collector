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
