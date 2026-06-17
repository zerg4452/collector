import { afterEach, describe, expect, it } from "vitest";
import { clearVideoProgress, loadVideoProgress, saveVideoProgress } from "./videoProgress";

afterEach(() => localStorage.clear());

describe("videoProgress", () => {
  it("returns 0 when nothing saved", () => {
    expect(loadVideoProgress("abc")).toBe(0);
  });

  it("saves and loads a position (floored)", () => {
    saveVideoProgress("abc", 42.7);
    expect(loadVideoProgress("abc")).toBe(42);
  });

  it("keeps positions per video id", () => {
    saveVideoProgress("abc", 10);
    saveVideoProgress("xyz", 20);
    expect(loadVideoProgress("abc")).toBe(10);
    expect(loadVideoProgress("xyz")).toBe(20);
  });

  it("ignores empty id and non-positive seconds", () => {
    saveVideoProgress("", 10);
    saveVideoProgress("abc", 0);
    saveVideoProgress("abc", -5);
    expect(loadVideoProgress("abc")).toBe(0);
  });

  it("clears a saved position", () => {
    saveVideoProgress("abc", 30);
    clearVideoProgress("abc");
    expect(loadVideoProgress("abc")).toBe(0);
  });
});
