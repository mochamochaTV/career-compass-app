import { describe, expect, it } from "vitest";
import { createBackupZip, parseBackupBytes } from "./backup";

const payload = {
  companies: [{ id: "company-1", name: "任天堂" }],
  cards: [{ id: "card-1", question: "自己紹介をしてください" }],
  schedule: [{ id: "task-1", title: "企業研究メモを更新" }],
  pitchTemplates: [{ id: "pitch-1", title: "自己PR", body: "強み：粘り強さ" }],
  reverseQuestions: [{ id: "revq-1", companyId: null, question: "入社後に期待される成果は？", answer: "" }],
  cardCategories: ["基本", "志望動機"],
  gdTips: [{ id: "gdtip-1", text: "役割に固執しない", updatedAt: "2026-10-05T00:00:00.000Z" }],
  gdThemes: [{ id: "gdtheme-1", companyId: null, theme: "離職を防ぐ施策", summary: "", myThoughts: "", updatedAt: "2026-10-05T00:00:00.000Z" }],
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
