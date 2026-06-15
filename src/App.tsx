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
        setData({ ...loaded, settings: { ...defaultSettings, ...loaded.settings } });
        const active = loaded.routines.find((routine) => routine.isActive);
        setSelectedRoutineId(active?.id ?? loaded.routines[0]?.id ?? "");
        setSelectedPlaylistId(loaded.playlists[0]?.id ?? "");
      })
      .catch(() => {
        // DB load failure — keep default empty state
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
    mutateSelectedDay((blocks) => [...blocks, createSingleBlock(exercise, blocks.length)]);
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
        x: Math.min(Math.max(12, origin.x + moveEvent.clientX - startX), window.innerWidth - 160),
        y: Math.min(Math.max(12, origin.y + moveEvent.clientY - startY), window.innerHeight - 220)
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

  useEffect(() => {
    if (!data.settings.routineTabEnabled && tab === "routines") {
      setTab("workout");
    }
  }, [data.settings.routineTabEnabled, tab]);

  if (!isLoaded) {
    return <main className="loading">데이터를 불러오는 중입니다.</main>;
  }

  const visibleTabs = tabItems.filter(
    (item) => item.id !== "routines" || data.settings.routineTabEnabled
  );

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
          {visibleTabs.map((item) => {
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
