// IndexedDB에 운동 앱 데이터를 저장하고 불러온다.
import type {
  AppData,
  AppSettings,
  ExerciseItem,
  RoutinePreset,
  WorkoutCompletion,
  YoutubePlaylist
} from "../types";
import { defaultSettings } from "../domain/workout";
import {
  CURRENT_DATA_VERSION,
  migrateExercise,
  migrateRoutine,
  needsMigration
} from "../domain/migration";

const DB_NAME = "collector-workout-companion";
const DB_VERSION = 2;

const stores = {
  exercises: "exercises",
  routines: "routines",
  completions: "completions",
  playlists: "playlists",
  settings: "settings"
} as const;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(stores).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const txStore = (
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode = "readonly"
) => db.transaction(storeName, mode).objectStore(storeName);

const getAll = async <T>(storeName: string): Promise<T[]> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = txStore(db, storeName).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result as T[]);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const getOne = async <T>(storeName: string, key: string): Promise<T | undefined> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = txStore(db, storeName).get(key);
    request.onsuccess = () => {
      db.close();
      resolve(request.result as T | undefined);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

const putAll = async <T>(storeName: string, values: T[]) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    store.clear();
    values.forEach((value) => store.put(value));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const putOne = async <T>(storeName: string, value: T) => {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const request = txStore(db, storeName, "readwrite").put(value);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
};

export const loadAppData = async (): Promise<AppData> => {
  const [rawExercises, rawRoutines, completions, playlists, storedSettings] = await Promise.all([
    getAll<ExerciseItem>(stores.exercises),
    getAll<RoutinePreset>(stores.routines),
    getAll<WorkoutCompletion>(stores.completions),
    getAll<YoutubePlaylist>(stores.playlists),
    getOne<AppSettings & { id: string }>(stores.settings, "app-settings")
  ]);

  const exercises = rawExercises.map(migrateExercise);
  const routines = rawRoutines.map(migrateRoutine);

  // v1 데이터는 변환 결과를 즉시 저장해 다음 로드부터 v2로 읽는다.
  if (needsMigration(rawExercises, rawRoutines)) {
    await Promise.all([
      putAll(stores.exercises, exercises),
      putAll(stores.routines, routines)
    ]);
  }

  const settings = storedSettings
    ? {
        alarmVolume: storedSettings.alarmVolume,
        restEndSoundEnabled: storedSettings.restEndSoundEnabled,
        restEndVisualAlertEnabled: storedSettings.restEndVisualAlertEnabled,
        floatingControlPosition: storedSettings.floatingControlPosition,
        keyboardShortcutEnabled: storedSettings.keyboardShortcutEnabled,
        routineTabEnabled:
          storedSettings.routineTabEnabled ?? defaultSettings.routineTabEnabled
      }
    : defaultSettings;

  return {
    version: CURRENT_DATA_VERSION,
    exercises,
    routines,
    completions,
    playlists,
    settings
  };
};

export const saveExercises = (exercises: ExerciseItem[]) =>
  putAll(stores.exercises, exercises);

export const saveRoutines = (routines: RoutinePreset[]) => putAll(stores.routines, routines);

export const saveCompletions = (completions: WorkoutCompletion[]) =>
  putAll(stores.completions, completions);

export const savePlaylists = (playlists: YoutubePlaylist[]) =>
  putAll(stores.playlists, playlists);

export const saveSettings = (settings: AppSettings) =>
  putOne(stores.settings, { id: "app-settings", ...settings });
