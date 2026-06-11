// 운동 루틴과 로컬 저장 데이터의 타입을 정의한다.
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ExerciseItem = {
  id: string;
  name: string;
  weight: string;
  targetReps: number;
  sets: number;
  restSeconds: number;
  createdAt: string;
  updatedAt: string;
};

export type RoutineExerciseSnapshot = {
  id: string;
  sourceExerciseId: string;
  name: string;
  weight: string;
  targetReps: number;
  sets: number;
  restSeconds: number;
  order: number;
};

export type RoutinePreset = {
  id: string;
  name: string;
  isActive: boolean;
  days: Record<Weekday, RoutineExerciseSnapshot[]>;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutCompletion = {
  date: string;
  completed: boolean;
  routinePresetId: string;
  completedAt: string;
};

export type FloatingControlPosition = {
  x: number;
  y: number;
};

export type AppSettings = {
  alarmVolume: number;
  restEndSoundEnabled: boolean;
  restEndVisualAlertEnabled: boolean;
  floatingControlPosition: FloatingControlPosition;
  keyboardShortcutEnabled: boolean;
};

export type WorkoutPhase = "ready" | "rest" | "complete";

export type WorkoutSessionState = {
  exerciseIndex: number;
  completedSets: number;
  phase: WorkoutPhase;
  remainingRestSeconds: number;
};

export type AppData = {
  exercises: ExerciseItem[];
  routines: RoutinePreset[];
  completions: WorkoutCompletion[];
  settings: AppSettings;
};
