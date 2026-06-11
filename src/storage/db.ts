// IndexedDB에 운동 앱 데이터를 저장하고 불러온다.
import type {
  AppData,
  AppSettings,
  ExerciseItem,
  RoutinePreset,
  WorkoutCompletion
} from "../types";
import { defaultSettings } from "../domain/workout";

const DB_NAME = "collector-workout-companion";
const DB_VERSION = 1;

const stores = {
  exercises: "exercises",
  routines: "routines",
  completions: "completions",
  settings: "settings"
} as const;

const openDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      Object.values(stores).forEach((storeName) => {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: storeName === "settings" ? "id" : "id" });
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
  const [exercises, routines, completions, storedSettings] = await Promise.all([
    getAll<ExerciseItem>(stores.exercises),
    getAll<RoutinePreset>(stores.routines),
    getAll<WorkoutCompletion>(stores.completions),
    getOne<AppSettings & { id: string }>(stores.settings, "app-settings")
  ]);

  const settings = storedSettings
    ? {
        alarmVolume: storedSettings.alarmVolume,
        restEndSoundEnabled: storedSettings.restEndSoundEnabled,
        restEndVisualAlertEnabled: storedSettings.restEndVisualAlertEnabled,
        floatingControlPosition: storedSettings.floatingControlPosition,
        keyboardShortcutEnabled: storedSettings.keyboardShortcutEnabled
      }
    : defaultSettings;

  return { exercises, routines, completions, settings };
};

export const saveExercises = (exercises: ExerciseItem[]) =>
  putAll(stores.exercises, exercises);

export const saveRoutines = (routines: RoutinePreset[]) => putAll(stores.routines, routines);

export const saveCompletions = (completions: WorkoutCompletion[]) =>
  putAll(stores.completions, completions);

export const saveSettings = (settings: AppSettings) =>
  putOne(stores.settings, { id: "app-settings", ...settings });
