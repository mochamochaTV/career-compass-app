import { describe, expect, it } from "vitest";
import { createBackupZip, parseBackupBytes } from "./backup";

const payload = {
  companies: [{ id: "company-1", name: "任天堂" }],
  cards: [{ id: "card-1", question: "自己紹介をしてください" }],
  schedule: [{ id: "task-1", title: "企業研究メモを更新" }],
  exportedAt: "2026-09-17T00:00:00.000Z",
  formatVersion: 1,
};

describe("Career Compass backup", () => {
  it("creates a ZIP that can be restored", () => {
    const restored = parseBackupBytes(createBackupZip(payload), "career-compass-backup.zip");
    expect(restored).toEqual(payload);
  });

  it("restores a plain JSON backup", () => {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    expect(parseBackupBytes(bytes, "career-compass-backup.json")).toEqual(payload);
  });

  it("rejects an invalid backup", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: "world" }));
    expect(() => parseBackupBytes(bytes, "backup.json")).toThrow();
    expect(() => parseBackupBytes(new TextEncoder().encode("not json"), "backup.json")).toThrow();
  });
});
