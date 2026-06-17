// 유튜브 영상별 마지막 재생 위치를 localStorage 에 저장한다.
// 재생 진행 상태는 핵심 데이터가 아니므로 IndexedDB 와 분리한다.
const KEY = "collector-video-progress";

const readMap = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

const writeMap = (map: Record<string, number>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 용량 초과 등은 무시 (재생 위치는 부가 기능)
  }
};

export const loadVideoProgress = (videoId: string): number => {
  if (!videoId) {
    return 0;
  }
  const value = readMap()[videoId];
  return typeof value === "number" && value > 0 ? value : 0;
};

export const saveVideoProgress = (videoId: string, seconds: number) => {
  if (!videoId || !(seconds > 0)) {
    return;
  }
  const map = readMap();
  map[videoId] = Math.floor(seconds);
  writeMap(map);
};

export const clearVideoProgress = (videoId: string) => {
  if (!videoId) {
    return;
  }
  const map = readMap();
  if (videoId in map) {
    delete map[videoId];
    writeMap(map);
  }
};
