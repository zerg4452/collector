// 유튜브 URL 변환 규칙을 검증한다.
import { describe, expect, it } from "vitest";
import { toYoutubeEmbedUrl } from "./youtube";

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
