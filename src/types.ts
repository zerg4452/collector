// 운동 루틴과 로컬 저장 데이터의 타입을 정의한다.
export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type SegmentType = "normal" | "cluster";

// 한 운동 안에서 같은 설정으로 반복되는 세트 구간
export type SetSegment = {
  id: string;
  type: SegmentType;
  sets: number;
  weight: string;
  reps: number;              // normal 전용
  clusterReps: number[];     // cluster 전용, 예: [10, 8, 6]
  intraRestSeconds: number;  // cluster 전용, 안내 표시용
};

export type ExerciseItem = {
  id: string;
  name: string;
  segments: SetSegment[];
  restSeconds: number;       // 세트(라운드) 간 휴식
  createdAt: string;
  updatedAt: string;
};

export type BlockExerciseSnapshot = {
  id: string;
  sourceExerciseId: string;
  name: string;
  segments: SetSegment[];
  order: number;
};

// 루틴 → 블록 → 종목. 종목 1개짜리 블록 = 단독 운동
export type RoutineBlock = {
  id: string;
  exercises: BlockExerciseSnapshot[];
  rounds: number;
  restSeconds: number;       // 라운드 간 휴식
  order: number;
};

export type RoutinePreset = {
  id: string;
  name: string;
  isActive: boolean;
  days: Record<Weekday, RoutineBlock[]>;
  createdAt: string;
  updatedAt: string;
};

export type WorkoutCompletion = {
  id: string;                // 날짜 키와 동일 (하루 1건)
  date: string;
  completed: boolean;
  routinePresetId: string;
  completedAt: string;
};

export type YoutubePlaylistItem = {
  id: string;
  url: string;
  label: string;             // oEmbed 제목, 실패 시 URL
};

export type YoutubePlaylist = {
  id: string;
  name: string;
  items: YoutubePlaylistItem[];
  createdAt: string;
  updatedAt: string;
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
  routineTabEnabled: boolean;
};

export type WorkoutPhase = "ready" | "rest" | "complete";

export type WorkoutSessionState = {
  blockIndex: number;
  round: number;             // 1부터 시작
  exerciseIndex: number;     // 블록 안 종목 인덱스
  phase: WorkoutPhase;
  remainingRestSeconds: number;
};

export type AppData = {
  version: number;
  exercises: ExerciseItem[];
  routines: RoutinePreset[];
  completions: WorkoutCompletion[];
  playlists: YoutubePlaylist[];
  settings: AppSettings;
};
