export const toYoutubeVideoId = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.replace("/", "");
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) {
        return v;
      }
      const shorts = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (shorts?.[1]) {
        return shorts[1];
      }
      const embed = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embed?.[1]) {
        return embed[1];
      }
    }
  } catch {
    return "";
  }
  return "";
};

// 유튜브 URL을 앱 안에서 재생 가능한 주소로 변환한다.
export const toYoutubeEmbedUrl = (value: string) => {
  const id = toYoutubeVideoId(value);
  return id ? `https://www.youtube.com/embed/${id}` : "";
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
