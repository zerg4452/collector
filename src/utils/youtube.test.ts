// 유튜브 URL 변환 규칙을 검증한다.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchYoutubeTitle,
  nextPlaylistIndex,
  previousPlaylistIndex,
  toYoutubeEmbedUrl,
  toYoutubeVideoId
} from "./youtube";

describe("toYoutubeVideoId", () => {
  it("extracts id from watch url", () => {
    expect(toYoutubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
  });
  it("extracts id from youtu.be url", () => {
    expect(toYoutubeVideoId("https://youtu.be/xyz789")).toBe("xyz789");
  });
  it("extracts id from shorts and embed", () => {
    expect(toYoutubeVideoId("https://www.youtube.com/shorts/sh0rt")).toBe("sh0rt");
    expect(toYoutubeVideoId("https://www.youtube.com/embed/emb3d")).toBe("emb3d");
  });
  it("returns empty for invalid", () => {
    expect(toYoutubeVideoId("not a url")).toBe("");
  });
});

describe("toYoutubeEmbedUrl", () => {
  it("converts a standard watch URL", () => {
    expect(toYoutubeEmbedUrl("https://www.youtube.com/watch?v=abc123")).toBe(
      "https://www.youtube.com/embed/abc123"
    );
  });

  it("converts a short youtu.be URL", () => {
    expect(toYoutubeEmbedUrl("https://youtu.be/abc123")).toBe(
      "https://www.youtube.com/embed/abc123"
    );
  });

  it("returns empty string for unsupported input", () => {
    expect(toYoutubeEmbedUrl("not a url")).toBe("");
  });
});

describe("playlist navigation", () => {
  it("cycles forward and wraps to the first item", () => {
    expect(nextPlaylistIndex(3, 0)).toBe(1);
    expect(nextPlaylistIndex(3, 2)).toBe(0);
    expect(nextPlaylistIndex(0, 0)).toBe(0);
  });

  it("cycles backward and wraps to the last item", () => {
    expect(previousPlaylistIndex(3, 0)).toBe(2);
    expect(previousPlaylistIndex(3, 2)).toBe(1);
    expect(previousPlaylistIndex(0, 0)).toBe(0);
  });
});

describe("fetchYoutubeTitle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the oEmbed title on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ title: "운동 음악 1시간" })
      })
    );

    await expect(fetchYoutubeTitle("https://youtu.be/abc123")).resolves.toBe("운동 음악 1시간");
  });

  it("falls back to the url on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(fetchYoutubeTitle("https://youtu.be/abc123")).resolves.toBe(
      "https://youtu.be/abc123"
    );
  });
});
