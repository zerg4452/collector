// 유튜브 URL을 앱 안에서 재생 가능한 주소로 변환한다.
export const toYoutubeEmbedUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : "";
    }

    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }

      const shortsMatch = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (shortsMatch?.[1]) {
        return `https://www.youtube.com/embed/${shortsMatch[1]}`;
      }

      const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch?.[1]) {
        return `https://www.youtube.com/embed/${embedMatch[1]}`;
      }
    }
  } catch {
    return "";
  }

  return "";
};

export const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const nextPlaylistIndex = (length: number, current: number) =>
  length <= 0 ? 0 : (current + 1) % length;

export const previousPlaylistIndex = (length: number, current: number) =>
  length <= 0 ? 0 : (current - 1 + length) % length;

// 제목 취득 실패(오프라인 등) 시 URL을 그대로 라벨로 쓴다.
export const fetchYoutubeTitle = async (url: string): Promise<string> => {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    if (!response.ok) {
      return url;
    }
    const data = (await response.json()) as { title?: string };
    return data.title?.trim() || url;
  } catch {
    return url;
  }
};
