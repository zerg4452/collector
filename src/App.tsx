// 운동 companion의 화면과 사용자 흐름을 구성한다.
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Dumbbell,
  ExternalLink,
  Grip,
  ListChecks,
  MousePointerClick,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Trash2,
  Volume2
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advanceSet,
  clampVolume,
  createCompletion,
  createId,
  createSnapshot,
  defaultSettings,
  emptyRoutineDays,
  finishRest,
  formatSeconds,
  getRoutineForDate,
  getTodayKey,
  initialWorkoutSession,
  setActiveRoutine,
  toDateKey,
  weekdayLabels,
  weekdays
} from "./domain/workout";
import {
  loadAppData,
  saveCompletions,
  saveExercises,
  saveRoutines,
  saveSettings
} from "./storage/db";
import type {
  AppData,
  AppSettings,
  ExerciseItem,
  RoutinePreset,
  Weekday,
  WorkoutSessionState
} from "./types";
import { isHttpUrl, toYoutubeEmbedUrl } from "./utils/youtube";

type Tab = "workout" | "exercises" | "routines" | "calendar" | "settings";

type ExerciseForm = {
  name: string;
  weight: string;
  targetReps: string;
  sets: string;
  restSeconds: string;
};

const emptyExerciseForm: ExerciseForm = {
  name: "",
  weight: "",
  targetReps: "10",
  sets: "3",
  restSeconds: "90"
};

const tabItems: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "workout", label: "운동", icon: Activity },
  { id: "exercises", label: "운동 목록", icon: Dumbbell },
  { id: "routines", label: "루틴", icon: ListChecks },
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

const normalizeExerciseForm = (form: ExerciseForm) => ({
  name: form.name.trim(),
  weight: form.weight.trim(),
  targetReps: Math.max(1, Number(form.targetReps) || 1),
  sets: Math.max(1, Number(form.sets) || 1),
  restSeconds: Math.max(0, Number(form.restSeconds) || 0)
});

function App() {
  const [tab, setTab] = useState<Tab>("workout");
  const [data, setData] = useState<AppData>({
    exercises: [],
    routines: [],
    completions: [],
    settings: defaultSettings
  });
  const [isLoaded, setIsLoaded] = useState(false);
  const [exerciseForm, setExerciseForm] = useState<ExerciseForm>(emptyExerciseForm);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [routineName, setRoutineName] = useState("");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<Weekday>(getTodayKey());
  const [youtubeUrl, setYoutubeUrl] = useState("");
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
      })
      .finally(() => setIsLoaded(true));
  }, []);

  useEffect(() => {
    latestPositionRef.current = data.settings.floatingControlPosition;
  }, [data.settings.floatingControlPosition]);

  const todayPlan = useMemo(() => getRoutineForDate(data.routines), [data.routines]);
  const selectedRoutine = data.routines.find((routine) => routine.id === selectedRoutineId) ?? null;
  const currentExercise = todayPlan.exercises[session.exerciseIndex] ?? null;
  const embedUrl = toYoutubeEmbedUrl(youtubeUrl);
  const completedDates = useMemo(
    () => new Map(data.completions.filter((item) => item.completed).map((item) => [item.date, item])),
    [data.completions]
  );

  useEffect(() => {
    setSession(initialWorkoutSession());
    setPreviousSession(null);
    setRestAlert(false);
  }, [todayPlan.routine?.id, todayPlan.weekday]);

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

  const updateSettings = (next: AppSettings) => {
    setData((current) => ({ ...current, settings: next }));
    void saveSettings(next);
  };

  const handleSaveExercise = () => {
    const normalized = normalizeExerciseForm(exerciseForm);
    if (!normalized.name) {
      return;
    }

    const now = new Date().toISOString();
    if (editingExerciseId) {
      updateExercises(
        data.exercises.map((exercise) =>
          exercise.id === editingExerciseId
            ? { ...exercise, ...normalized, updatedAt: now }
            : exercise
        )
      );
    } else {
      updateExercises([
        ...data.exercises,
        {
          id: createId("exercise"),
          ...normalized,
          createdAt: now,
          updatedAt: now
        }
      ]);
    }

    setExerciseForm(emptyExerciseForm);
    setEditingExerciseId(null);
  };

  const handleEditExercise = (exercise: ExerciseItem) => {
    setExerciseForm({
      name: exercise.name,
      weight: exercise.weight,
      targetReps: String(exercise.targetReps),
      sets: String(exercise.sets),
      restSeconds: String(exercise.restSeconds)
    });
    setEditingExerciseId(exercise.id);
  };

  const handleDeleteExercise = (exerciseId: string) => {
    updateExercises(data.exercises.filter((exercise) => exercise.id !== exerciseId));
  };

  const handleCreateRoutine = () => {
    const name = routineName.trim();
    if (!name) {
      return;
    }

    const nextRoutine = makeRoutine(name, data.routines.length === 0);
    const nextRoutines =
      data.routines.length === 0 ? [nextRoutine] : [...data.routines, nextRoutine];
    updateRoutines(nextRoutines);
    setSelectedRoutineId(nextRoutine.id);
    setRoutineName("");
  };

  const handleActivateRoutine = (routineId: string) => {
    const next = setActiveRoutine(data.routines, routineId);
    updateRoutines(next);
    setSelectedRoutineId(routineId);
  };

  const handleAddExerciseToDay = (exerciseId: string) => {
    if (!selectedRoutine) {
      return;
    }

    const exercise = data.exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }

    const nextRoutines = data.routines.map((routine) => {
      if (routine.id !== selectedRoutine.id) {
        return routine;
      }
      const nextDay = [
        ...routine.days[selectedDay],
        createSnapshot(exercise, routine.days[selectedDay].length)
      ];
      return {
        ...routine,
        days: { ...routine.days, [selectedDay]: nextDay },
        updatedAt: new Date().toISOString()
      };
    });
    updateRoutines(nextRoutines);
  };

  const handleRemoveSnapshot = (routineId: string, day: Weekday, snapshotId: string) => {
    const nextRoutines = data.routines.map((routine) => {
      if (routine.id !== routineId) {
        return routine;
      }
      return {
        ...routine,
        days: {
          ...routine.days,
          [day]: routine.days[day]
            .filter((snapshot) => snapshot.id !== snapshotId)
            .map((snapshot, index) => ({ ...snapshot, order: index }))
        },
        updatedAt: new Date().toISOString()
      };
    });
    updateRoutines(nextRoutines);
  };

  const completeWorkoutForToday = useCallback(() => {
    if (!todayPlan.routine) {
      return;
    }

    const completion = createCompletion(todayPlan.routine.id);
    const next = [
      ...data.completions.filter((item) => item.date !== completion.date),
      completion
    ];
    updateCompletions(next);
  }, [data.completions, todayPlan.routine]);

  const handleSetComplete = useCallback(() => {
    if (!todayPlan.routine || todayPlan.exercises.length === 0 || session.phase === "rest") {
      return;
    }

    setPreviousSession(session);
    const result = advanceSet(session, todayPlan.exercises);
    setSession(result.state);
    setRestAlert(false);

    if (result.completedWorkout) {
      completeWorkoutForToday();
    }
  }, [completeWorkoutForToday, session, todayPlan.exercises, todayPlan.routine]);

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
            youtubeUrl={youtubeUrl}
            setYoutubeUrl={setYoutubeUrl}
            embedUrl={embedUrl}
            routineName={todayPlan.routine?.name ?? ""}
            weekday={todayPlan.weekday}
            exercises={todayPlan.exercises}
            currentExercise={currentExercise}
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
            onFormChange={setExerciseForm}
            onSave={handleSaveExercise}
            onEdit={handleEditExercise}
            onDelete={handleDeleteExercise}
            onCancelEdit={() => {
              setExerciseForm(emptyExerciseForm);
              setEditingExerciseId(null);
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
            onAddExercise={handleAddExerciseToDay}
            onRemoveSnapshot={handleRemoveSnapshot}
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

type WorkoutViewProps = {
  youtubeUrl: string;
  setYoutubeUrl: (value: string) => void;
  embedUrl: string;
  routineName: string;
  weekday: Weekday;
  exercises: ReturnType<typeof getRoutineForDate>["exercises"];
  currentExercise: ReturnType<typeof getRoutineForDate>["exercises"][number] | null;
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
  youtubeUrl,
  setYoutubeUrl,
  embedUrl,
  routineName,
  weekday,
  exercises,
  currentExercise,
  session,
  settings,
  restAlert,
  hasCompletion,
  onSetComplete,
  onUndo,
  onDragStart,
  canUndo
}: WorkoutViewProps) {
  const canCompleteSet = Boolean(currentExercise) && session.phase !== "rest";
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
        <input
          value={youtubeUrl}
          onChange={(event) => setYoutubeUrl(event.target.value)}
          placeholder="YouTube URL"
          aria-label="YouTube URL"
        />
        {isHttpUrl(youtubeUrl) && (
          <a className="icon-link" href={youtubeUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={17} aria-hidden="true" />
            외부 열기
          </a>
        )}
      </div>

      <div className={`video-stage ${restAlert ? "rest-finished" : ""}`}>
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
              {session.phase === "rest" ? "휴식" : session.phase === "complete" ? "완료" : "진행"}
            </span>
            <strong>{currentExercise?.name ?? "오늘 운동 없음"}</strong>
            <span>
              {currentExercise
                ? `${currentExercise.weight || "무게 미입력"} · ${currentExercise.targetReps}회 · ${
                    session.completedSets
                  }/${currentExercise.sets}세트`
                : "루틴을 준비해 주세요"}
            </span>
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
        </div>
      </div>

      <div className="workout-list">
        {exercises.length === 0 ? (
          <p className="empty-state">오늘 루틴 없음</p>
        ) : (
          exercises.map((exercise, index) => (
            <div
              key={exercise.id}
              className={`workout-row ${index === session.exerciseIndex ? "current" : ""}`}
            >
              <span className="order-badge">{index + 1}</span>
              <div>
                <strong>{exercise.name}</strong>
                <span>
                  {exercise.weight || "무게 미입력"} · {exercise.targetReps}회 · {exercise.sets}세트 · 휴식{" "}
                  {formatSeconds(exercise.restSeconds)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

type ExerciseLibraryProps = {
  exercises: ExerciseItem[];
  form: ExerciseForm;
  editingExerciseId: string | null;
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
  onFormChange,
  onSave,
  onEdit,
  onDelete,
  onCancelEdit
}: ExerciseLibraryProps) {
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
              무게
              <input
                value={form.weight}
                onChange={(event) => onFormChange({ ...form, weight: event.target.value })}
                placeholder="60kg"
              />
            </label>
            <label>
              횟수
              <input
                type="number"
                min="1"
                value={form.targetReps}
                onChange={(event) => onFormChange({ ...form, targetReps: event.target.value })}
              />
            </label>
            <label>
              세트
              <input
                type="number"
                min="1"
                value={form.sets}
                onChange={(event) => onFormChange({ ...form, sets: event.target.value })}
              />
            </label>
            <label>
              휴식초
              <input
                type="number"
                min="0"
                value={form.restSeconds}
                onChange={(event) => onFormChange({ ...form, restSeconds: event.target.value })}
              />
            </label>
          </div>
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
                      {exercise.weight || "무게 미입력"} · {exercise.targetReps}회 · {exercise.sets}세트 · 휴식{" "}
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
  onAddExercise: (exerciseId: string) => void;
  onRemoveSnapshot: (routineId: string, day: Weekday, snapshotId: string) => void;
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
  onAddExercise,
  onRemoveSnapshot
}: RoutineViewProps) {
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
                      onAddExercise(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  defaultValue=""
                >
                  <option value="">운동 선택</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.id} value={exercise.id}>
                      {exercise.name} · {exercise.weight || "무게 미입력"} · {exercise.targetReps}회
                    </option>
                  ))}
                </select>
              </div>

              <div className="item-list">
                {selectedRoutine.days[selectedDay].length === 0 ? (
                  <p className="empty-state">배치된 운동 없음</p>
                ) : (
                  selectedRoutine.days[selectedDay].map((snapshot, index) => (
                    <div className="list-item" key={snapshot.id}>
                      <span className="order-badge">{index + 1}</span>
                      <div>
                        <strong>{snapshot.name}</strong>
                        <span>
                          {snapshot.weight || "무게 미입력"} · {snapshot.targetReps}회 · {snapshot.sets}세트 ·
                          휴식 {formatSeconds(snapshot.restSeconds)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() =>
                          onRemoveSnapshot(selectedRoutine.id, selectedDay, snapshot.id)
                        }
                        title="삭제"
                      >
                        <Trash2 size={17} aria-hidden="true" />
                      </button>
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

export default App;
